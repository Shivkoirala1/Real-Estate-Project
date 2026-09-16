const mongoose = require('mongoose');
const Archive = require('../models/Archive');
const Property = require('../models/Property');
const Sale = require('../models/Sale');
const Rental = require('../models/Rental');
const EMIPlan = require('../models/EMIPlan');
const DataOpsLog = require('../models/DataOpsLog');

/**
 * Cold-storage archival for Property / Sale / Rental / EMIPlan.
 *
 * These four are chained (EMIPlan -> Sale -> Property, and Rental ->
 * Property in parallel with Sale), so a record is only eligible once
 * nothing "downstream" still needs it live:
 *
 *   EMIPlan  archives when its own status is terminal and old enough.
 *            (leaf node - nothing else references an EMIPlan by id)
 *   Sale     archives when verified/rejected, old enough, AND no
 *            still-live EMIPlan points at it.
 *   Rental   archives when verified/rejected and old enough (same shape
 *            as Sale; nothing references a Rental by id).
 *   Property archives (moves out of the hot collection) only once it has
 *            been soft-archived (isArchived=true - already a field on the
 *            model, just previously unused for this) for long enough AND
 *            no still-live Sale NOR Rental points at it.
 *
 * Running the jobs in this order (EMIPlan, then Sale, then Rental, then
 * Property) in the same pass means a fully-settled chain (old EMI plan ->
 * old sale -> long-archived listing) can clear all its stages in one run,
 * oldest dependency first.
 *
 * A record is "still-live" simply by still existing in its hot collection
 * - once archived, it's deleted from there, so the referential check is a
 * plain `exists()` against the primary collection, not the Archive one.
 *
 * No multi-document transactions: standalone MongoDB deployments (common
 * in smaller setups) don't support them. Instead each record is archived
 * one at a time, snapshot-write-then-delete, so a mid-run crash leaves
 * at worst a record that's in both places (harmless - re-running the job
 * just skips it, see the partial unique index on Archive) rather than in
 * neither.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);

const envInt = (name, fallback) => {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

// Financial/legal records (sales, rentals, EMI schedules) are kept far
// longer than marketing/listing data before they're moved to cold storage.
const THRESHOLDS = {
  property: () => envInt('PROPERTY_COLD_STORAGE_AFTER_DAYS', 90), // days *since being soft-archived*
  sale: () => envInt('SALE_ARCHIVE_AFTER_DAYS', 365),
  rental: () => envInt('RENTAL_ARCHIVE_AFTER_DAYS', 365),
  emiPlan: () => envInt('EMI_PLAN_ARCHIVE_AFTER_DAYS', 365),
};

const snapshot = (doc) => JSON.parse(JSON.stringify(doc.toObject({ depopulate: true })));

const archiveOne = async ({ entityType, doc, summary, reason, actorId }) => {
  await Archive.create({
    entityType,
    originalId: doc._id,
    data: snapshot(doc),
    summary,
    reason,
    archivedBy: actorId || null,
  });
  // Only delete once the snapshot write above has actually succeeded.
  await doc.deleteOne();
};

/**
 * EMIPlan: leaf node, archives on status + age alone.
 */
const archiveEmiPlans = async ({ dryRun = false, actorId = null } = {}) => {
  const cutoff = daysAgo(THRESHOLDS.emiPlan());
  const candidates = await EMIPlan.find({
    status: { $in: ['completed', 'cancelled', 'defaulted'] },
    updatedAt: { $lt: cutoff },
  });

  let affected = 0;
  const errors = [];
  for (const plan of candidates) {
    try {
      if (!dryRun) {
        await archiveOne({
          entityType: 'emiPlan',
          doc: plan,
          summary: { title: `EMI plan (${plan.status})`, relatedIds: { buyer: plan.buyer, agent: plan.agent, sale: plan.sale, property: plan.property } },
          reason: `status=${plan.status}, inactive since ${plan.updatedAt.toISOString()}`,
          actorId,
        });
      }
      affected += 1;
    } catch (err) {
      errors.push(`EMIPlan ${plan._id}: ${err.message}`);
    }
  }
  return { processed: candidates.length, affected, skipped: 0, errors };
};

/**
 * Sale: archives on status + age, guarded by "no live EMIPlan still points here".
 */
const archiveSales = async ({ dryRun = false, actorId = null } = {}) => {
  const cutoff = daysAgo(THRESHOLDS.sale());
  const candidates = await Sale.find({
    status: { $in: ['verified', 'rejected'] },
    updatedAt: { $lt: cutoff },
  });

  let affected = 0;
  let skipped = 0;
  const errors = [];
  for (const sale of candidates) {
    try {
      const hasLiveEmiPlan = await EMIPlan.exists({ sale: sale._id });
      if (hasLiveEmiPlan) {
        skipped += 1;
        continue; // eslint-disable-line no-continue
      }
      if (!dryRun) {
        await archiveOne({
          entityType: 'sale',
          doc: sale,
          summary: { title: `Sale (${sale.status})`, relatedIds: { buyer: sale.buyer, agent: sale.agent, property: sale.property, lead: sale.lead } },
          reason: `status=${sale.status}, inactive since ${sale.updatedAt.toISOString()}`,
          actorId,
        });
      }
      affected += 1;
    } catch (err) {
      errors.push(`Sale ${sale._id}: ${err.message}`);
    }
  }
  return { processed: candidates.length, affected, skipped, errors };
};

/**
 * Rental: archives on status + age, same shape as Sale. Leaf node for
 * archival purposes - nothing references a Rental by id.
 */
const archiveRentals = async ({ dryRun = false, actorId = null } = {}) => {
  const cutoff = daysAgo(THRESHOLDS.rental());
  const candidates = await Rental.find({
    status: { $in: ['verified', 'rejected'] },
    updatedAt: { $lt: cutoff },
  });

  let affected = 0;
  let skipped = 0;
  const errors = [];
  for (const rental of candidates) {
    try {
      if (!dryRun) {
        await archiveOne({
          entityType: 'rental',
          doc: rental,
          summary: { title: `Rental (${rental.status})`, relatedIds: { tenant: rental.tenant, agent: rental.agent, property: rental.property, lead: rental.lead } },
          reason: `status=${rental.status}, inactive since ${rental.updatedAt.toISOString()}`,
          actorId,
        });
      }
      affected += 1;
    } catch (err) {
      errors.push(`Rental ${rental._id}: ${err.message}`);
    }
  }
  return { processed: candidates.length, affected, skipped, errors };
};

/**
 * Property: only ever considered once it's been soft-archived
 * (isArchived=true - an admin action or a future "auto soft-archive sold
 * listings" job, not implemented here) for PROPERTY_COLD_STORAGE_AFTER_DAYS,
 * and guarded by "no live Sale NOR Rental still points here".
 */
const archiveProperties = async ({ dryRun = false, actorId = null } = {}) => {
  const cutoff = daysAgo(THRESHOLDS.property());
  const candidates = await Property.find({
    isArchived: true,
    updatedAt: { $lt: cutoff },
  });

  let affected = 0;
  let skipped = 0;
  const errors = [];
  for (const property of candidates) {
    try {
      const hasLiveSale = await Sale.exists({ property: property._id });
      if (hasLiveSale) {
        skipped += 1;
        continue; // eslint-disable-line no-continue
      }
      const hasLiveRental = await Rental.exists({ property: property._id });
      if (hasLiveRental) {
        skipped += 1;
        continue; // eslint-disable-line no-continue
      }
      if (!dryRun) {
        await archiveOne({
          entityType: 'property',
          doc: property,
          summary: { title: property.title, relatedIds: { listedBy: property.listedBy, soldTo: property.soldTo } },
          reason: `soft-archived since ${property.updatedAt.toISOString()}`,
          actorId,
        });
      }
      affected += 1;
    } catch (err) {
      errors.push(`Property ${property._id}: ${err.message}`);
    }
  }
  return { processed: candidates.length, affected, skipped, errors };
};

const JOBS = {
  archive_emi_plans: archiveEmiPlans,
  archive_sales: archiveSales,
  archive_rentals: archiveRentals,
  archive_properties: archiveProperties,
};

const runJob = async (jobName, opts = {}) => {
  const startedAt = new Date();
  const result = await JOBS[jobName](opts);
  const finishedAt = new Date();
  await DataOpsLog.create({
    job: jobName,
    startedAt,
    finishedAt,
    dryRun: Boolean(opts.dryRun),
    processed: result.processed,
    affected: result.affected,
    skipped: result.skipped,
    errors: result.errors,
    triggeredBy: opts.actorId || null,
  });
  return result;
};

/**
 * Full nightly/weekly pass, innermost dependency first so a fully-settled
 * chain can clear all its stages in one run.
 */
const runArchivalPass = async (opts = {}) => {
  const results = {};
  results.archive_emi_plans = await runJob('archive_emi_plans', opts);
  results.archive_sales = await runJob('archive_sales', opts);
  results.archive_rentals = await runJob('archive_rentals', opts);
  results.archive_properties = await runJob('archive_properties', opts);
  return results;
};

/**
 * Move an archived record back into its live collection. Fails loudly if
 * a record with that id already exists there (shouldn't happen under
 * normal operation, but restoring must never silently overwrite).
 */
const MODEL_BY_TYPE = { property: Property, sale: Sale, rental: Rental, emiPlan: EMIPlan };

const restoreArchived = async (archiveId, actorId) => {
  const archived = await Archive.findById(archiveId);
  if (!archived) throw Object.assign(new Error('Archived record not found'), { statusCode: 404 });
  if (archived.restoredAt) throw Object.assign(new Error('This record was already restored'), { statusCode: 409 });

  const Model = MODEL_BY_TYPE[archived.entityType];
  const alreadyLive = await Model.exists({ _id: archived.originalId });
  if (alreadyLive) {
    throw Object.assign(new Error('A live record with this id already exists - cannot restore over it'), { statusCode: 409 });
  }

  const restoredDoc = new Model({ ...archived.data, _id: archived.originalId });
  restoredDoc.isNew = true;
  await restoredDoc.save({ validateBeforeSave: false });

  archived.restoredAt = new Date();
  archived.restoredBy = actorId || null;
  await archived.save();

  return restoredDoc;
};

module.exports = {
  archiveEmiPlans,
  archiveSales,
  archiveRentals,
  archiveProperties,
  runArchivalPass,
  restoreArchived,
  THRESHOLDS,
};
