const Upload = require('../models/Upload');
const UploadSession = require('../models/UploadSession');
const DataOpsLog = require('../models/DataOpsLog');
const { destroyByPublicId } = require('./cloudinary');

// Orphan + destroy-queue sweeper for the direct-upload Upload records.
// Follows the verificationRetention/dataRetention conventions: dry-run
// support, per-record errors collected, DataOpsLog write, never throws.
//
// Handles:
// - expired uncommitted rows (pending/completed past expiresAt) → deleted +
//   Cloudinary destroy (abandoned forms, failed entity saves, pre-submit
//   removals that never called DELETE)
// - destroy queue retries (deleted rows with destroyQueued, < 5 attempts)
// - stale open sessions past expiry → expired
//
// Deliberately NOT a MongoDB TTL index: rows must trigger Cloudinary
// destroy first, which a storage-engine sweep can't do.

const MAX_DESTROY_ATTEMPTS = 5;

const cleanupUploads = async ({ dryRun = false } = {}) => {
  const now = new Date();
  let processed = 0;
  let affected = 0;
  const errors = [];

  // 1. Expire uncommitted uploads.
  const expired = await Upload.find({
    status: { $in: ['pending', 'completed'] },
    expiresAt: { $lt: now },
  }).select('_id publicId resourceType status');

  for (const upload of expired) {
    processed += 1;
    try {
      if (!dryRun) {
        const ok = await destroyByPublicId(upload.publicId, upload.resourceType);
        await Upload.updateOne(
          { _id: upload._id },
          {
            $set: {
              status: 'deleted',
              destroyQueued: !ok,
              lastError: ok ? '' : 'sweeper destroy failed — will retry',
            },
            $inc: ok ? {} : { destroyAttempts: 1 },
          }
        );
      }
      affected += 1;
    } catch (err) {
      errors.push(`Upload ${upload._id}: ${err.message}`);
    }
  }

  // 2. Retry queued destroys (deferred-delete failures from requestDelete
  // and from step 1 above).
  const queued = await Upload.find({
    status: 'deleted',
    destroyQueued: true,
    destroyAttempts: { $lt: MAX_DESTROY_ATTEMPTS },
  }).select('_id publicId resourceType destroyAttempts');

  for (const upload of queued) {
    // Skip rows just handled in step 1 of this same pass.
    if (expired.some((e) => String(e._id) === String(upload._id))) continue; // eslint-disable-line no-continue
    processed += 1;
    try {
      if (!dryRun) {
        const ok = await destroyByPublicId(upload.publicId, upload.resourceType);
        await Upload.updateOne(
          { _id: upload._id },
          ok
            ? { $set: { destroyQueued: false, lastError: '' } }
            : {
              $set: { lastError: 'sweeper destroy retry failed' },
              $inc: { destroyAttempts: 1 },
            }
        );
      }
      affected += 1;
    } catch (err) {
      errors.push(`Upload ${upload._id}: ${err.message}`);
    }
  }

  // 3. Close stale sessions (audit trail for abandoned-upload tracking).
  const sessions = await UploadSession.updateMany(
    { status: 'open', expiresAt: { $lt: now } },
    { $set: { status: 'expired' } }
  );

  return {
    processed,
    affected,
    skipped: 0,
    errors,
    sessionsExpired: sessions.modifiedCount || 0,
  };
};

const runUploadCleanupPass = async (opts = {}) => {
  const startedAt = new Date();
  const result = await cleanupUploads(opts);
  const finishedAt = new Date();
  await DataOpsLog.create({
    job: 'cleanup_uploads',
    startedAt,
    finishedAt,
    dryRun: Boolean(opts.dryRun),
    processed: result.processed,
    affected: result.affected,
    skipped: result.skipped,
    errors: result.errors,
    triggeredBy: opts.actorId || null,
  });
  return { cleanup_uploads: result };
};

module.exports = { cleanupUploads, runUploadCleanupPass };
