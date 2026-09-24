const { cloudinary, publicIdFromUrl } = require('./cloudinary');
const User = require('../models/User');
const DataOpsLog = require('../models/DataOpsLog');

/**
 * Identity-document retention for User verification photos
 * (`selfiePhoto`, `citizenshipPhotoFront`, `citizenshipPhotoBack`).
 *
 * Policy of record: verification photos are kept while the account is
 * active, plus a grace window after deactivation. Past the window the URLs
 * are nulled and the Cloudinary bytes are deleted best-effort, so a
 * stale/deleted account stops referencing identity documents.
 *
 * Deliberately NOT a MongoDB TTL index: expiry must null fields (not delete
 * the user) and attempt Cloudinary cleanup, which a storage-engine sweep
 * can't do. Follows the dataRetention.js conventions (dry-run support,
 * per-record errors collected, DataOpsLog write, never throws).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);

const envInt = (name, fallback) => {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const RETENTION_DAYS = {
  verificationDocs: () => envInt('VERIFICATION_DOCS_RETENTION_DAYS', 90),
};

const PHOTO_FIELDS = ['selfiePhoto', 'citizenshipPhotoFront', 'citizenshipPhotoBack'];

const cleanupVerificationDocs = async ({ dryRun = false } = {}) => {
  const cutoff = daysAgo(RETENTION_DAYS.verificationDocs());
  const candidates = await User.find({
    isActive: false,
    updatedAt: { $lt: cutoff },
    // At least one photo URL still present ($nin excludes '' defaults as
    // well as missing/null, so untouched accounts are never selected).
    $or: PHOTO_FIELDS.map((f) => ({ [f]: { $nin: ['', null] } })),
  }).select('_id selfiePhoto citizenshipPhotoFront citizenshipPhotoBack');

  let affected = 0;
  const errors = [];
  for (const user of candidates) {
    try {
      if (!dryRun) {
        for (const field of PHOTO_FIELDS) {
          const publicId = publicIdFromUrl(user[field]);
          if (!publicId) continue; // eslint-disable-line no-continue
          try {
            // eslint-disable-next-line no-await-in-loop
            await cloudinary.uploader.destroy(publicId);
          } catch (err) {
            errors.push(`User ${user._id} ${field}: Cloudinary destroy failed (${err.message})`);
          }
        }
        await User.updateOne(
          { _id: user._id },
          { $set: { selfiePhoto: '', citizenshipPhotoFront: '', citizenshipPhotoBack: '' } }
        );
      }
      affected += 1;
    } catch (err) {
      errors.push(`User ${user._id}: ${err.message}`);
    }
  }

  return { processed: candidates.length, affected, skipped: 0, errors };
};

const JOBS = {
  cleanup_verification_docs: cleanupVerificationDocs,
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

const runVerificationRetentionPass = async (opts = {}) => {
  const results = {};
  results.cleanup_verification_docs = await runJob('cleanup_verification_docs', opts);
  return results;
};

module.exports = { cleanupVerificationDocs, runVerificationRetentionPass, RETENTION_DAYS };
