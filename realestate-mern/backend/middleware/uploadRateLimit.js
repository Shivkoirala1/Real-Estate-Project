// In-memory sign rate limiter (Phase 1). Bounds signature issuance per
// user+purpose; verification documents get a stricter daily cap.
// NOTE: single-instance memory. Behind multiple Render instances each box
// enforces independently (fail-open direction: slightly generous, never
// blocking legitimate users). If sign abuse becomes a real incident,
// promote to a shared store (Mongo/Redis) — the checkSignLimit() seam is
// the only call site.
const buckets = new Map();

const envInt = (name, fallback) => {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const prune = (hits, windowMs, now) => {
  while (hits.length > 0 && now - hits[0] > windowMs) hits.shift();
};

// Returns { allowed, retryAfterSec }. Throws nothing.
const checkSignLimit = (userId, purpose) => {
  const now = Date.now();
  const strict = purpose === 'verification-document';
  const limit = strict
    ? envInt('UPLOAD_VERIFICATION_SIGN_RATE_LIMIT_PER_DAY', 10)
    : envInt('UPLOAD_SIGN_RATE_LIMIT_PER_HOUR', 60);
  const windowMs = strict ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  const key = `${userId}:${purpose}`;
  let hits = buckets.get(key);
  if (!hits) {
    hits = [];
    buckets.set(key, hits);
  }
  prune(hits, windowMs, now);
  if (hits.length >= limit) {
    const retryAfterSec = Math.ceil((hits[0] + windowMs - now) / 1000);
    return { allowed: false, retryAfterSec: Math.max(retryAfterSec, 1) };
  }
  hits.push(now);
  // Opportunistic memory hygiene.
  if (buckets.size > 10000) {
    for (const [k, v] of buckets) {
      prune(v, windowMs, now);
      if (v.length === 0) buckets.delete(k);
    }
  }
  return { allowed: true, retryAfterSec: 0 };
};

// Test seam.
const resetSignLimits = () => buckets.clear();

module.exports = { checkSignLimit, resetSignLimits };
