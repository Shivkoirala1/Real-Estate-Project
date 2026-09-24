// Old-vs-new upload measurements (Phase 2 instrumentation).
// In-memory aggregates only — no PII, no per-user data. Served to admins
// via GET /api/uploads/metrics. No performance claims are made from these;
// they exist so the migration can be compared on real numbers.
//
// Recorded per property submit, split by flow (direct | legacy):
// - count, total + slow (>30 s) submissions
// - file count, Cloudinary-bound bytes (completed Upload clientMeta for
//   direct; multer file.size for legacy)
// - client-reported retries / failures / timeouts (advisory, direct only)
// - validation rejections and backend errors
// Plus global upload-infra error counters (sign 429, complete 422,
// commit 409/404, sweeper actions are in DataOpsLog instead).

const flows = () => ({
  count: 0,
  totalDurationMs: 0,
  maxDurationMs: 0,
  slowCount: 0,
  totalFiles: 0,
  totalBytes: 0,
  clientRetries: 0,
  clientFailures: 0,
  clientTimeouts: 0,
  validationErrors: 0,
  backendErrors: 0,
});

const state = {
  startedAt: new Date().toISOString(),
  propertySubmit: { direct: flows(), legacy: flows() },
  heroSubmit: { direct: flows(), legacy: flows() },
  // Phase 4 single-file surfaces, split by purpose (no second system —
  // same bucket shape, same summarize()).
  singleSubmit: {
    'blog-cover': { direct: flows(), legacy: flows() },
    avatar: { direct: flows(), legacy: flows() },
    'emi-slip': { direct: flows(), legacy: flows() },
  },
  uploadErrors: {
    signRateLimited: 0,
    completeRejected: 0,
    commitConflict: 0,
    commitNotFound: 0,
    commitFailed: 0,
    deleteConflict: 0,
  },
};

const SLOW_SUBMIT_MS = 30 * 1000;

const recordPropertySubmit = (flow, { durationMs = 0, fileCount = 0, bytes = 0, clientStats = {}, outcome = 'success' } = {}) => {
  const bucket = state.propertySubmit[flow] || state.propertySubmit.legacy;
  bucket.count += 1;
  bucket.totalDurationMs += durationMs;
  bucket.maxDurationMs = Math.max(bucket.maxDurationMs, durationMs);
  if (durationMs > SLOW_SUBMIT_MS) bucket.slowCount += 1;
  bucket.totalFiles += fileCount || 0;
  bucket.totalBytes += bytes || 0;
  bucket.clientRetries += Number(clientStats.retries) || 0;
  bucket.clientFailures += Number(clientStats.failures) || 0;
  bucket.clientTimeouts += Number(clientStats.timeouts) || 0;
  if (outcome === 'validation') bucket.validationErrors += 1;
  if (outcome === 'error') bucket.backendErrors += 1;
};

const recordUploadError = (name) => {
  if (name in state.uploadErrors) state.uploadErrors[name] += 1;
};

// Phase 3: hero slide submits. kind is 'image' | 'video' | '' (unknown /
// validation failure before media resolution); hasThumbnail counts thumbnail
// presence. Same bucket shape as property so old-vs-new compares directly.
const recordHeroSubmit = (flow, { durationMs = 0, kind = '', hasThumbnail = false, bytes = 0, clientStats = {}, outcome = 'success' } = {}) => {
  const bucket = state.heroSubmit[flow] || state.heroSubmit.legacy;
  bucket.count += 1;
  bucket.totalDurationMs += durationMs;
  bucket.maxDurationMs = Math.max(bucket.maxDurationMs, durationMs);
  if (durationMs > SLOW_SUBMIT_MS) bucket.slowCount += 1;
  if (kind === 'image' || kind === 'video') {
    bucket.totalFiles += hasThumbnail ? 2 : 1;
  }
  bucket.totalBytes += bytes || 0;
  bucket.clientRetries += Number(clientStats.retries) || 0;
  bucket.clientFailures += Number(clientStats.failures) || 0;
  bucket.clientTimeouts += Number(clientStats.timeouts) || 0;
  if (outcome === 'validation') bucket.validationErrors += 1;
  if (outcome === 'error') bucket.backendErrors += 1;
};

const summarize = (bucket) => ({
  count: bucket.count,
  avgDurationMs: bucket.count ? Math.round(bucket.totalDurationMs / bucket.count) : 0,
  maxDurationMs: bucket.maxDurationMs,
  slowCount: bucket.slowCount,
  totalFiles: bucket.totalFiles,
  avgFiles: bucket.count ? Number((bucket.totalFiles / bucket.count).toFixed(1)) : 0,
  totalBytes: bucket.totalBytes,
  clientRetries: bucket.clientRetries,
  clientFailures: bucket.clientFailures,
  clientTimeouts: bucket.clientTimeouts,
  validationErrors: bucket.validationErrors,
  backendErrors: bucket.backendErrors,
});

// Phase 4: one single-file submit (blog cover / avatar / EMI slip).
// fileCount is 0/1; hasFile distinguishes "no file attached" (valid for
// optional covers/slips) from a with-file submit.
const recordSingleSubmit = (purpose, flow, { durationMs = 0, hasFile = false, bytes = 0, clientStats = {}, outcome = 'success' } = {}) => {
  const group = state.singleSubmit[purpose];
  if (!group) return;
  const bucket = group[flow] || group.legacy;
  bucket.count += 1;
  bucket.totalDurationMs += durationMs;
  bucket.maxDurationMs = Math.max(bucket.maxDurationMs, durationMs);
  if (durationMs > SLOW_SUBMIT_MS) bucket.slowCount += 1;
  if (hasFile) bucket.totalFiles += 1;
  bucket.totalBytes += bytes || 0;
  bucket.clientRetries += Number(clientStats.retries) || 0;
  bucket.clientFailures += Number(clientStats.failures) || 0;
  bucket.clientTimeouts += Number(clientStats.timeouts) || 0;
  if (outcome === 'validation') bucket.validationErrors += 1;
  if (outcome === 'error') bucket.backendErrors += 1;
};

const getMetrics = () => ({
  since: state.startedAt,
  now: new Date().toISOString(),
  propertySubmit: {
    direct: summarize(state.propertySubmit.direct),
    legacy: summarize(state.propertySubmit.legacy),
  },
  heroSubmit: {
    direct: summarize(state.heroSubmit.direct),
    legacy: summarize(state.heroSubmit.legacy),
  },
  singleSubmit: {
    'blog-cover': {
      direct: summarize(state.singleSubmit['blog-cover'].direct),
      legacy: summarize(state.singleSubmit['blog-cover'].legacy),
    },
    avatar: {
      direct: summarize(state.singleSubmit.avatar.direct),
      legacy: summarize(state.singleSubmit.avatar.legacy),
    },
    'emi-slip': {
      direct: summarize(state.singleSubmit['emi-slip'].direct),
      legacy: summarize(state.singleSubmit['emi-slip'].legacy),
    },
  },
  uploadErrors: { ...state.uploadErrors },
});

module.exports = { recordPropertySubmit, recordHeroSubmit, recordSingleSubmit, recordUploadError, getMetrics };
