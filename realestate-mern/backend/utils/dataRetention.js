const Conversation = require('../models/Conversation');
const ContactForm = require('../models/ContactForm');
const Lead = require('../models/Lead');
const DataOpsLog = require('../models/DataOpsLog');

/**
 * Hard-delete retention job for Conversation and ContactForm.
 *
 * Deliberately NOT a MongoDB TTL index, even though that's the more
 * "native" way to expire documents. Two reasons:
 *
 *   1. TTL deletes happen inside the storage engine's background sweep,
 *      which bypasses Mongoose middleware entirely - no pre/post 'remove'
 *      hooks fire. We need to run the referential-integrity guard below
 *      (skip anything still linked from a Lead) before deleting, which a
 *      raw TTL index can't do.
 *   2. A job we control can log what happened (DataOpsLog) and support a
 *      dry run, which a silent background sweep can't.
 *
 * Guard: a Lead denormalizes name/email/phone from its source ContactForm
 * and keeps its own `notes`/`activities`, but `Lead.conversationThreads`
 * points at real Conversation documents for their message history, and
 * `Lead.contactForm` points at the original submission. Deleting either
 * out from under a live Lead would silently blank out that history in
 * the pipeline UI, so both jobs skip anything still referenced by a Lead.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);

const envInt = (name, fallback) => {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const RETENTION_DAYS = {
  contactForm: () => envInt('CONTACT_FORM_RETENTION_DAYS', 30),
  conversation: () => envInt('CONVERSATION_RETENTION_DAYS', 30),
};

/**
 * ContactForm: 30 days after submission, unless it was converted into a
 * Lead (that's the pipeline's own record now - kept under the Lead's
 * lifecycle, not this timer) or a Lead still references it directly.
 */
const cleanupContactForms = async ({ dryRun = false } = {}) => {
  const cutoff = daysAgo(RETENTION_DAYS.contactForm());
  const candidates = await ContactForm.find({
    createdAt: { $lt: cutoff },
    status: { $ne: 'converted' },
  }).select('_id');

  const ids = candidates.map((c) => c._id);
  if (ids.length === 0) return { processed: 0, affected: 0, skipped: 0, errors: [] };

  const referencedIds = await Lead.find({ contactForm: { $in: ids } }).distinct('contactForm');
  const referenced = new Set(referencedIds.map(String));
  const deletable = ids.filter((id) => !referenced.has(String(id)));

  let affected = 0;
  const errors = [];
  if (!dryRun && deletable.length > 0) {
    try {
      const res = await ContactForm.deleteMany({ _id: { $in: deletable } });
      affected = res.deletedCount || 0;
    } catch (err) {
      errors.push(err.message);
    }
  } else {
    affected = deletable.length;
  }

  return { processed: ids.length, affected, skipped: ids.length - deletable.length, errors };
};

/**
 * Conversation: 30 days after being closed (isActive=false - `updatedAt`
 * is the closed-at timestamp, since flipping isActive touches it). Open
 * threads are never touched regardless of age. Skips anything still on a
 * Lead's conversationThreads.
 */
const cleanupConversations = async ({ dryRun = false } = {}) => {
  const cutoff = daysAgo(RETENTION_DAYS.conversation());
  const candidates = await Conversation.find({
    isActive: false,
    updatedAt: { $lt: cutoff },
  }).select('_id');

  const ids = candidates.map((c) => c._id);
  if (ids.length === 0) return { processed: 0, affected: 0, skipped: 0, errors: [] };

  const referencedIds = await Lead.find({ conversationThreads: { $in: ids } }).distinct('conversationThreads');
  const referenced = new Set(referencedIds.map(String));
  const deletable = ids.filter((id) => !referenced.has(String(id)));

  let affected = 0;
  const errors = [];
  if (!dryRun && deletable.length > 0) {
    try {
      const res = await Conversation.deleteMany({ _id: { $in: deletable } });
      affected = res.deletedCount || 0;
    } catch (err) {
      errors.push(err.message);
    }
  } else {
    affected = deletable.length;
  }

  return { processed: ids.length, affected, skipped: ids.length - deletable.length, errors };
};

const JOBS = {
  cleanup_contact_forms: cleanupContactForms,
  cleanup_conversations: cleanupConversations,
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

const runRetentionPass = async (opts = {}) => {
  const results = {};
  results.cleanup_contact_forms = await runJob('cleanup_contact_forms', opts);
  results.cleanup_conversations = await runJob('cleanup_conversations', opts);
  return results;
};

module.exports = { cleanupContactForms, cleanupConversations, runRetentionPass, RETENTION_DAYS };
