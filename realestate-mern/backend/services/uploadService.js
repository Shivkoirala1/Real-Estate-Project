const crypto = require('crypto');
const mongoose = require('mongoose');
const Upload = require('../models/Upload');
const UploadSession = require('../models/UploadSession');
const { PURPOSES, SESSION_SCOPES, TTL, isVerifiedForPurpose } = require('../config/uploadPurposes');
const { checkSignLimit } = require('../middleware/uploadRateLimit');
const { destroyByPublicId, signUploadParams, privateDownloadUrl } = require('../utils/cloudinary');

// Reusable backend upload service (direct-upload migration, rule C).
// Controllers deal with business rules; ALL Cloudinary specifics live here.
// Nothing here trusts client-controlled upload constraints — folder,
// publicId, resourceType, formats, size caps and delivery type always come
// from config/uploadPurposes.js via server-held session + purpose.

const enabledError = () => {
  const err = new Error('Direct upload is temporarily disabled');
  err.statusCode = 503;
  return err;
};

const isDirectUploadEnabled = () => process.env.UPLOAD_DIRECT_ENABLED !== 'false';

const fail = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};

const randomSuffix = () => crypto.randomBytes(8).toString('hex');

// Resolve the effective policy for a (purpose + variant refs) request.
// hero-media requires mediaKind; verification-document requires docType.
const resolvePolicy = (purpose, refs = {}) => {
  const def = PURPOSES[purpose];
  if (!def) throw fail(400, `Unknown upload purpose: ${purpose}`);
  if (purpose === 'hero-media') {
    const kind = refs.mediaKind === 'video' ? 'video' : refs.mediaKind === 'image' ? 'image' : null;
    if (!kind) throw fail(400, 'mediaKind must be "image" or "video" for hero-media uploads');
    return { ...def.mediaKinds[kind], kind, deliveryType: def.deliveryType, roles: def.roles, maxPerSession: def.maxPerSession, entityType: def.entityType };
  }
  if (purpose === 'verification-document') {
    if (!def.docTypes.includes(refs.docType)) {
      throw fail(400, `docType must be one of: ${def.docTypes.join(', ')}`);
    }
  }
  if (purpose === 'emi-slip') {
    if (!refs.planId || !refs.installmentNo) {
      throw fail(400, 'planId and installmentNo are required for emi-slip uploads');
    }
  }
  return { ...def };
};

const assertSessionUsable = async (sessionId, user) => {
  if (!mongoose.Types.ObjectId.isValid(sessionId)) throw fail(400, 'Invalid session id');
  const session = await UploadSession.findById(sessionId);
  if (!session) throw fail(404, 'Upload session not found');
  if (String(session.userId) !== String(user._id)) {
    throw fail(403, 'This upload session belongs to another user');
  }
  if (session.status !== 'open' || session.expiresAt < new Date()) {
    if (session.status === 'open') {
      session.status = 'expired';
      await session.save();
    }
    throw fail(410, 'Upload session has expired — start a new one');
  }
  return session;
};

const assertRoleForPurpose = (user, purpose, policy) => {
  if (!policy.roles.includes(user.role)) {
    throw fail(403, `Role '${user.role}' may not upload ${purpose}`);
  }
  if (!isVerifiedForPurpose(user, purpose)) {
    throw fail(403, 'Your account must be verified before uploading for this purpose');
  }
};

// POST /api/uploads/session — backend-issued correlation id (decision §14.1).
const createSession = async ({ user, scope, ref = '' }) => {
  if (!isDirectUploadEnabled()) throw enabledError();
  if (!SESSION_SCOPES[scope]) {
    throw fail(400, `Unknown upload scope. Allowed: ${Object.keys(SESSION_SCOPES).join(', ')}`);
  }
  // Scope-level gates mirror the strictest purpose inside the scope.
  if ((scope === 'hero' || scope === 'blog') && user.role !== 'admin') {
    throw fail(403, `Role '${user.role}' may not open a ${scope} upload session`);
  }
  // EMI slips mirror the verification-request route (authorize('user')) —
  // only buyers ever submit slips; admins review, agents never touch them.
  if (scope === 'emi' && user.role !== 'user') {
    throw fail(403, `Role '${user.role}' may not open an emi upload session`);
  }
  if (scope === 'property' && user.role !== 'admin' && user.verificationStatus !== 'verified') {
    throw fail(403, 'Your account must be verified before uploading property media');
  }
  const session = await UploadSession.create({
    userId: user._id,
    scope,
    ref: String(ref || '').slice(0, 120),
    expiresAt: new Date(Date.now() + TTL.resourceHours() * 60 * 60 * 1000),
  });
  return session;
};

// POST /api/uploads/sign — returns signed params + uploadId. One Upload row
// per call; each publicId is unique, so a replayed signature inside the
// validity window can at worst re-upload the same slot (idempotent retry),
// never hijack another asset.
const signUpload = async ({ user, sessionId, purpose, refs = {} }) => {
  if (!isDirectUploadEnabled()) throw enabledError();
  const session = await assertSessionUsable(sessionId, user);
  if (!SESSION_SCOPES[session.scope].includes(purpose)) {
    throw fail(400, `Purpose ${purpose} is not allowed in a ${session.scope} session`);
  }
  const policy = resolvePolicy(purpose, refs);
  assertRoleForPurpose(user, purpose, policy);

  // Phase 4: emi-slip binds the business relationship at SIGN time (not
  // just submit) — the buyer, the plan, and the installment are all
  // resolved server-side from the planId/installmentNo refs. A signed
  // upload is therefore already scoped to one installment.
  let context = {};
  if (purpose === 'emi-slip') {
    const grant = await assertEmiSlipAllowed({
      actor: user,
      planId: refs.planId,
      installmentNo: refs.installmentNo,
    });
    context = { planId: grant.plan._id, label: `installment-${grant.installmentNumber}` };
  }

  const { allowed, retryAfterSec } = checkSignLimit(String(user._id), purpose);
  if (!allowed) {
    const err = fail(429, 'Upload signature rate limit exceeded — please try again later');
    err.retryAfterSec = retryAfterSec;
    throw err;
  }

  if (policy.maxPerSession) {
    const active = await Upload.countDocuments({
      sessionId: session._id,
      purpose,
      status: { $in: ['pending', 'completed', 'committed'] },
    });
    if (active >= policy.maxPerSession) {
      throw fail(409, `Session already holds the maximum (${policy.maxPerSession}) uploads for ${purpose}`);
    }
  }

  const ttlHours = typeof policy.ttlHours === 'function' ? policy.ttlHours() : TTL.resourceHours();
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `${policy.idPrefix}-${randomSuffix()}`;
  // Signed params — IMPORTANT: Cloudinary excludes `file`, `cloud_name`,
  // `resource_type` and `api_key` from signature computation (`resource_type`
  // travels in the endpoint path /image|video/upload, not the signed body).
  // Signing `resource_type` produces "Invalid Signature" on every upload.
  // `type: 'private'` IS a signable delivery parameter and must stay for
  // restricted purposes. The frontend must send these exact values.
  const paramsToSign = {
    timestamp,
    folder: policy.folder,
    public_id: publicId,
    overwrite: false,
    allowed_formats: policy.allowedFormats.join(','),
    ...(policy.deliveryType === 'private' ? { type: 'private' } : {}),
  };
  const signature = signUploadParams(paramsToSign);

  // Cloudinary stores the asset at folder/public_id when BOTH are sent, so
  // the row must keep the FULL path — the basename alone 404s on delivery
  // and misses on destroy. The sign response still returns folder + basename
  // separately because the browser must send exactly what was signed.
  const fullPublicId = `${policy.folder}/${publicId}`;

  const upload = await Upload.create({
    sessionId: session._id,
    userId: user._id,
    purpose,
    publicId: fullPublicId,
    folder: policy.folder,
    resourceType: policy.resourceType,
    deliveryType: policy.deliveryType,
    maxBytes: policy.maxBytes,
    context,
    expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000),
  });

  return {
    uploadId: String(upload._id),
    sessionId: String(session._id),
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    signature,
    timestamp,
    folder: policy.folder,
    publicId,
    resourceType: policy.resourceType,
    allowedFormats: policy.allowedFormats,
    maxBytes: policy.maxBytes,
    deliveryType: policy.deliveryType,
    signatureExpiresInSec: TTL.signatureMinutes() * 60,
    expiresAt: upload.expiresAt,
  };
};

// POST /api/uploads/:id/complete — advisory metadata + plausibility checks
// (decision §14.2). Authoritative constraints are the Upload row + the
// signed params Cloudinary already enforced (folder, public_id, formats,
// overwrite:false). Size has no signed-param equivalent, so reported bytes
// are plausibility-checked; true byte verification without a per-upload
// Admin API call is an accepted residual (bounded by auth + rate limits +
// folder scoping + sweeper). Idempotent: re-completing returns current state.
const completeUpload = async ({ user, uploadId, meta = {} }) => {
  if (!mongoose.Types.ObjectId.isValid(uploadId)) throw fail(400, 'Invalid upload id');
  const upload = await Upload.findById(uploadId);
  if (!upload) throw fail(404, 'Upload not found');
  if (String(upload.userId) !== String(user._id) && user.role !== 'admin') {
    throw fail(403, 'This upload belongs to another user');
  }
  if (upload.status === 'completed' || upload.status === 'committed') return upload;
  if (upload.status === 'deleted') throw fail(410, 'Upload was deleted');
  if (upload.expiresAt < new Date()) throw fail(410, 'Upload authorization expired');

  const { bytes, format, resourceType, width, height, duration } = meta;
  if (resourceType && resourceType !== upload.resourceType) {
    throw fail(422, `Expected ${upload.resourceType} metadata for this upload`);
  }
  if (format) {
    const normalized = String(format).toLowerCase().replace(/^\./, '');
    // Ref-free policy lookup: sign-time refs (mediaKind/docType/planId)
    // aren't available here and must not be required — the row's own
    // purpose (+ resourceType for hero variants) selects the allowlist.
    const candidates = formatsForUpload(upload).map((f) => f.toLowerCase());
    // Treat jpg/jpeg interchangeably.
    const same = (a, b) => a === b || (['jpg', 'jpeg'].includes(a) && ['jpg', 'jpeg'].includes(b));
    if (!candidates.some((c) => same(c, normalized))) {
      throw fail(422, `Format .${normalized} is not allowed for ${upload.purpose}`);
    }
    upload.clientMeta.format = normalized;
  }
  if (bytes !== undefined && bytes !== null) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) throw fail(422, 'Invalid bytes value');
    if (n > upload.maxBytes) {
      throw fail(422, `Reported size exceeds the ${upload.maxBytes}-byte limit for ${upload.purpose}`);
    }
    upload.clientMeta.bytes = Math.floor(n);
  }
  if (width !== undefined && width !== null) upload.clientMeta.width = Math.max(0, Math.floor(Number(width) || 0));
  if (height !== undefined && height !== null) upload.clientMeta.height = Math.max(0, Math.floor(Number(height) || 0));
  if (duration !== undefined && duration !== null) upload.clientMeta.duration = Math.max(0, Number(duration) || 0);

  upload.status = 'completed';
  await upload.save();
  return upload;
};

// hero-media rows don't store mediaKind; the stored resourceType identifies
// the variant for format checks.
const heroVariantFromUpload = (upload) => {
  if (upload.purpose !== 'hero-media') return {};
  return { mediaKind: upload.resourceType === 'video' ? 'video' : 'image' };
};

// Format allowlist for a stored row without requiring sign-time refs.
const formatsForUpload = (upload) => {
  if (upload.purpose === 'hero-media') {
    const kinds = PURPOSES['hero-media'].mediaKinds;
    return kinds[upload.resourceType === 'video' ? 'video' : 'image'].allowedFormats;
  }
  return PURPOSES[upload.purpose].allowedFormats;
};

// Association mechanism (also exposed as POST /api/uploads/commit so Phase 1
// is independently verifiable; Phase 2+ controllers call this service
// directly inside their entity-write transaction). Marks rows committed;
// entity write + commit should share a mongoose session where practical
// (Cloudinary itself stays outside any transaction — the sweeper covers that
// boundary).
const ENTITY_PURPOSES = {
  property: ['property-image', 'property-cover'],
  heroslide: ['hero-media', 'hero-thumbnail'],
  blog: ['blog-cover'],
  user: ['avatar', 'verification-document'],
  'emi-installment': ['emi-slip'],
};

const commitUploads = async ({ actor, sessionId, uploadIds, entityType, entityId, mongoSession = null }) => {
  if (!Array.isArray(uploadIds) || uploadIds.length === 0) {
    throw fail(400, 'uploadIds must be a non-empty array');
  }
  const allowed = ENTITY_PURPOSES[entityType];
  if (!allowed) throw fail(400, `Unknown entityType: ${entityType}`);
  if (entityId && !mongoose.Types.ObjectId.isValid(entityId)) throw fail(400, 'Invalid entityId');

  const uploads = await Upload.find({ _id: { $in: uploadIds } }).session(mongoSession || null);
  if (uploads.length !== uploadIds.length) throw fail(404, 'One or more uploads not found');
  for (const upload of uploads) {
    if (String(upload.sessionId) !== String(sessionId)) {
      throw fail(403, `Upload ${upload._id} does not belong to this session`);
    }
    if (String(upload.userId) !== String(actor._id) && actor.role !== 'admin') {
      throw fail(403, `Upload ${upload._id} belongs to another user`);
    }
    if (!allowed.includes(upload.purpose)) {
      throw fail(422, `Upload ${upload._id} (purpose ${upload.purpose}) cannot attach to ${entityType}`);
    }
    // Phase 4: emi-slip rows carry their plan binding from sign time — the
    // commit must target that same plan, closing the attach-to-another-plan
    // hole that ownership checks alone can't see.
    if (entityType === 'emi-installment') {
      if (!upload.context?.planId || String(upload.context.planId) !== String(entityId)) {
        throw fail(403, `Upload ${upload._id} is not authorized for this EMI plan`);
      }
    }
    if (upload.status === 'committed') continue; // idempotent resubmit
    if (upload.status !== 'completed') {
      throw fail(409, `Upload ${upload._id} is ${upload.status} — complete it before committing`);
    }
    if (upload.expiresAt < new Date()) throw fail(410, `Upload ${upload._id} has expired`);
    upload.status = 'committed';
    upload.committedTo = { entityType, entityId: entityId || null };
    // eslint-disable-next-line no-await-in-loop
    await upload.save({ session: mongoSession || undefined });
  }
  return uploads;
};

// DELETE /api/uploads/:id — deferred destroy (decision §14.3). Marks deleted
// + queues destroy; the user-facing call never waits on Cloudinary.
// Committed rows are rejected (409) — removal must go through the owning
// entity update so references never dangle.
const requestDelete = async ({ actor, uploadId }) => {
  if (!mongoose.Types.ObjectId.isValid(uploadId)) throw fail(400, 'Invalid upload id');
  const upload = await Upload.findById(uploadId);
  if (!upload) throw fail(404, 'Upload not found');
  if (String(upload.userId) !== String(actor._id) && actor.role !== 'admin') {
    throw fail(403, 'This upload belongs to another user');
  }
  if (upload.status === 'committed') {
    throw fail(409, 'Committed upload — remove it from the owning entity instead');
  }
  if (upload.status === 'deleted') return upload;
  upload.status = 'deleted';
  upload.destroyQueued = true;
  await upload.save();
  // Best-effort immediate destroy; failure stays queued for the sweeper.
  const ok = await destroyByPublicId(upload.publicId, upload.resourceType);
  if (ok) {
    upload.destroyQueued = false;
    await upload.save();
  } else {
    upload.destroyAttempts += 1;
    upload.lastError = 'immediate destroy failed — queued for sweeper';
    await upload.save();
  }
  return upload;
};

// Derived public delivery URL for a completed/committed public upload.
// Single derivation point: property media, view endpoint and retire
// comparisons must all agree on the same string.
const publicDeliveryUrl = (upload) => {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const prefix = upload.resourceType === 'video' ? 'video' : 'image';
  const format = upload.clientMeta && upload.clientMeta.format ? `.${upload.clientMeta.format}` : '';
  return `https://res.cloudinary.com/${cloud}/${prefix}/upload/${upload.publicId}${format}`;
};
const buildView = async ({ viewer, uploadId }) => {
  if (!mongoose.Types.ObjectId.isValid(uploadId)) throw fail(400, 'Invalid upload id');
  const upload = await Upload.findById(uploadId);
  if (!upload) throw fail(404, 'Upload not found');
  if (upload.status === 'deleted') throw fail(410, 'Upload was deleted');
  const isOwner = String(upload.userId) === String(viewer._id);
  if (!isOwner && viewer.role !== 'admin') throw fail(403, 'Not authorized to view this file');
  if (upload.deliveryType === 'private') {
    const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;
    const format = upload.clientMeta.format || 'jpg';
    const url = privateDownloadUrl(upload.publicId, {
      format,
      resourceType: upload.resourceType,
      expiresAt,
    });
    return { url, expiresAt: new Date(expiresAt * 1000).toISOString(), deliveryType: 'private' };
  }
  return { url: publicDeliveryUrl(upload), deliveryType: 'public' };
};

// Phase 3 — hero media resolution. Same trust model as
// resolvePropertyUploads: admin-only, single hero session, correct purpose,
// completed state. The declared mediaType (when the client sends one) must
// match the row's server-side resourceType — mirrors the legacy
// "Media type does not match the uploaded file" rule.
const resolveHeroUploads = async ({
  actor,
  sessionId,
  mediaUploadId,
  thumbnailUploadId,
  mediaType,
  requireMedia = false,
  forEntityId = null,
}) => {
  if (actor.role !== 'admin') throw fail(403, 'Only admins may attach hero media');
  if (!mediaUploadId && !thumbnailUploadId) {
    if (requireMedia) throw fail(400, 'Slide media upload is required');
    return { mediaUrl: '', mediaPublicId: null, mediaResourceType: null, thumbUrl: null, thumbPublicId: null, uploads: [] };
  }
  if (!sessionId) throw fail(400, 'uploadSessionId is required with direct-upload media');
  const session = await assertSessionUsable(sessionId, actor);
  if (session.scope !== 'hero') throw fail(400, 'Upload session is not a hero session');

  const ids = [mediaUploadId, thumbnailUploadId].filter(Boolean).map(String);
  if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) throw fail(400, 'Invalid upload id');
  const rows = await Upload.find({ _id: { $in: ids } });
  if (rows.length !== ids.length) throw fail(404, 'One or more uploads not found');
  const byId = new Map(rows.map((r) => [String(r._id), r]));

  const resolveOne = (id, expectedPurpose) => {
    const upload = byId.get(String(id));
    if (String(upload.sessionId) !== String(session._id)) {
      throw fail(403, `Upload ${id} does not belong to this session`);
    }
    if (String(upload.userId) !== String(actor._id) && actor.role !== 'admin') {
      throw fail(403, `Upload ${id} belongs to another user`);
    }
    if (upload.purpose !== expectedPurpose) {
      throw fail(422, `Upload ${id} (purpose ${upload.purpose}) cannot be used here`);
    }
    if (upload.status === 'committed') {
      if (forEntityId && String(upload.committedTo?.entityId) === String(forEntityId)) {
        return upload;
      }
      throw fail(409, `Upload ${id} is already attached to another slide`);
    }
    if (upload.status !== 'completed') {
      throw fail(409, `Upload ${id} is ${upload.status} — finish uploading before submitting`);
    }
    if (upload.expiresAt < new Date()) throw fail(410, `Upload ${id} has expired`);
    return upload;
  };

  const mediaRow = mediaUploadId ? resolveOne(mediaUploadId, 'hero-media') : null;
  if (mediaRow && mediaType && mediaType !== mediaRow.resourceType) {
    throw fail(400, 'Media type does not match the uploaded file');
  }
  const thumbRow = thumbnailUploadId ? resolveOne(thumbnailUploadId, 'hero-thumbnail') : null;
  if (requireMedia && !mediaRow) throw fail(400, 'Slide media upload is required');
  return {
    mediaUrl: mediaRow ? publicDeliveryUrl(mediaRow) : '',
    mediaPublicId: mediaRow ? mediaRow.publicId : null,
    mediaResourceType: mediaRow ? mediaRow.resourceType : null,
    thumbUrl: thumbRow ? publicDeliveryUrl(thumbRow) : null,
    thumbPublicId: thumbRow ? thumbRow.publicId : null,
    uploads: [mediaRow, thumbRow].filter(Boolean),
  };
};

// Destroys a replaced legacy asset only when no Upload row owns it.
// Direct-upload bytes are retired via retireRemovedEntityUploads instead,
// so one path never double-handles the same bytes.
const destroyIfOrphaned = async ({ publicId, entityId, resourceType = 'image' }) => {
  if (!publicId) return;
  try {
    const owned = await Upload.exists({ publicId, 'committedTo.entityId': entityId, status: { $in: ['committed', 'deleted'] } });
    if (!owned) await destroyByPublicId(publicId, resourceType);
  } catch (err) {
    console.error(`Legacy hero media cleanup failed (${publicId}):`, err.message);
  }
};

// Marks an entity's committed Upload rows deleted WITHOUT destroying bytes
// (the caller already handled the bytes, e.g. destroySlideMedia on slide
// delete). Bookkeeping only — never throws.
const releaseEntityUploads = async ({ entityType, entityId }) => {
  try {
    await Upload.updateMany(
      { 'committedTo.entityType': entityType, 'committedTo.entityId': entityId, status: 'committed' },
      { $set: { status: 'deleted', destroyQueued: false, lastError: '' } }
    );
  } catch (err) {
    console.error(`Release ${entityType} uploads failed:`, err.message);
  }
};
// Phase 4 — EMI slip business authorization. Mirrors the verification-request
// route guards exactly: the plan must exist, the actor must be the linked
// buyer (role 'user'), the installment must exist and be pending, and no
// verification may already be pending for it. Used at SIGN time (so an
// unauthorized upload can't even start) and re-checked at SUBMIT time
// (state may have changed in between). Returns { plan, installmentNumber }.
const assertEmiSlipAllowed = async ({ actor, planId, installmentNo }) => {
  const EMIPlan = require('../models/EMIPlan');
  if (!mongoose.Types.ObjectId.isValid(String(planId || ''))) throw fail(404, 'EMI plan not found');
  const n = Number(installmentNo);
  if (!Number.isInteger(n) || n < 1) throw fail(400, 'Invalid installment number');
  const plan = await EMIPlan.findById(planId);
  if (!plan) throw fail(404, 'EMI plan not found');
  const buyerId = plan.buyer && plan.buyer._id ? plan.buyer._id : plan.buyer;
  if (actor.role !== 'user' || !buyerId || String(buyerId) !== String(actor._id)) {
    throw fail(403, 'Only the buyer this EMI plan is linked to can upload a payment slip.');
  }
  const installment = (plan.installments || []).find((i) => i.installmentNumber === n);
  if (!installment) throw fail(404, 'Installment not found');
  if (installment.status !== 'pending') {
    throw fail(400, `This installment is already ${installment.status} - nothing to verify.`);
  }
  if (installment.verification && installment.verification.status === 'pending') {
    throw fail(409, 'A verification request for this installment is already pending review.');
  }
  return { plan, installmentNumber: n };
};

// Phase 4 — single-file resolvers for blog/avatar/emi. Same trust model as
// the property/hero resolvers: session usability + ownership, exact purpose,
// completed state (or committed-to-same-entity for idempotent resubmits).
// Returns server-derived identifiers — never client URLs.
const resolveSingleUpload = async ({ actor, sessionId, scope, uploadId, purpose, forEntity = null }) => {
  if (!uploadId) return null;
  if (!mongoose.Types.ObjectId.isValid(String(uploadId))) throw fail(400, 'Invalid upload id');
  if (!sessionId) throw fail(400, 'uploadSessionId is required with direct-upload media');
  const session = await assertSessionUsable(sessionId, actor);
  if (session.scope !== scope) throw fail(400, `Upload session is not a ${scope} session`);
  const upload = await Upload.findById(uploadId);
  if (!upload) throw fail(404, 'Upload not found');
  if (String(upload.sessionId) !== String(session._id)) {
    throw fail(403, 'Upload does not belong to this session');
  }
  if (String(upload.userId) !== String(actor._id)) {
    // No admin bypass here: blog/avatar/emi attaches are strictly self
    // (blog create/update are already admin-gated at the route; the upload
    // itself must still be the admin's own).
    throw fail(403, 'Upload belongs to another user');
  }
  if (upload.purpose !== purpose) {
    throw fail(422, `Upload (purpose ${upload.purpose}) cannot be used here`);
  }
  if (upload.status === 'committed') {
    if (forEntity && String(upload.committedTo?.entityId) === String(forEntity)) return upload;
    throw fail(409, 'Upload is already attached elsewhere');
  }
  if (upload.status !== 'completed') {
    throw fail(409, `Upload is ${upload.status} — finish uploading before submitting`);
  }
  if (upload.expiresAt < new Date()) throw fail(410, 'Upload authorization expired');
  return upload;
};

const resolveBlogCover = ({ actor, sessionId, coverUploadId, forEntityId = null }) =>
  resolveSingleUpload({ actor, sessionId, scope: 'blog', uploadId: coverUploadId, purpose: 'blog-cover', forEntity: forEntityId });

const resolveAvatar = ({ actor, sessionId, avatarUploadId }) =>
  resolveSingleUpload({ actor, sessionId, scope: 'avatar', uploadId: avatarUploadId, purpose: 'avatar' });

// EMI resolve re-validates the business relationship at SUBMIT time (the
// sign-time check may be stale) and returns the private publicId — never a
// delivery URL, so no permanent URL ever lands in business records.
const resolveEmiSlip = async ({ actor, sessionId, slipUploadId, planId, installmentNo }) => {
  if (!slipUploadId) return null;
  const { installmentNumber } = await assertEmiSlipAllowed({ actor, planId, installmentNo });
  const upload = await resolveSingleUpload({
    actor, sessionId, scope: 'emi', uploadId: slipUploadId, purpose: 'emi-slip',
  });
  if (!upload) return null;
  if (!upload.context?.planId || String(upload.context.planId) !== String(planId)) {
    throw fail(403, 'Upload is not authorized for this EMI plan');
  }
  return { upload, publicId: upload.publicId, installmentNumber };
};
// references WITHOUT committing: same session, owner-or-admin, correct
// purpose, completed state. Returns server-derived delivery URLs — the
// property controller persists THESE, never client-supplied URLs.
// `forEntityId` allows idempotent resubmits: an upload already committed to
// that same property (e.g. update retried after a dropped response) resolves
// instead of conflicting.
const normalizeIdList = (value) => {
  if (value === undefined || value === null) return [];
  let list = value;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch (e) {
      list = [value];
    }
  }
  if (!Array.isArray(list)) list = [list];
  return list.map(String).filter((id) => mongoose.Types.ObjectId.isValid(id));
};

// Phase 2 — property media resolution. Validates a property submit's upload
// references WITHOUT committing: same session, owner-or-admin, correct
// purpose, completed state. Returns server-derived delivery URLs — the
// property controller persists THESE, never client-supplied URLs.
const resolvePropertyUploads = async ({ actor, sessionId, coverUploadId, galleryUploadIds, forEntityId = null }) => {
  const galleryIds = normalizeIdList(galleryUploadIds);
  const coverId = coverUploadId && mongoose.Types.ObjectId.isValid(String(coverUploadId))
    ? String(coverUploadId)
    : null;
  if (!coverId && galleryIds.length === 0) return { coverUrl: '', galleryUrls: [], uploads: [] };
  if (!sessionId) throw fail(400, 'uploadSessionId is required with direct-upload media');
  const session = await assertSessionUsable(sessionId, actor);
  if (session.scope !== 'property') throw fail(400, 'Upload session is not a property session');
  if (galleryIds.length > 15) throw fail(400, 'A property holds at most 15 gallery images');

  const ids = [...(coverId ? [coverId] : []), ...galleryIds];
  const rows = await Upload.find({ _id: { $in: ids } });
  if (rows.length !== ids.length) throw fail(404, 'One or more uploads not found');
  const byId = new Map(rows.map((r) => [String(r._id), r]));

  const resolveOne = (id, expectedPurpose) => {
    const upload = byId.get(String(id));
    if (String(upload.sessionId) !== String(session._id)) {
      throw fail(403, `Upload ${id} does not belong to this session`);
    }
    if (String(upload.userId) !== String(actor._id) && actor.role !== 'admin') {
      throw fail(403, `Upload ${id} belongs to another user`);
    }
    if (upload.purpose !== expectedPurpose) {
      throw fail(422, `Upload ${id} (purpose ${upload.purpose}) cannot be used here`);
    }
    if (upload.status === 'committed') {
      // Idempotent resubmit to the same property only.
      if (forEntityId && String(upload.committedTo?.entityId) === String(forEntityId)) {
        return upload;
      }
      throw fail(409, `Upload ${id} is already attached to another listing`);
    }
    if (upload.status !== 'completed') {
      throw fail(409, `Upload ${id} is ${upload.status} — finish uploading before submitting`);
    }
    if (upload.expiresAt < new Date()) throw fail(410, `Upload ${id} has expired`);
    return upload;
  };

  const coverRow = coverId ? resolveOne(coverId, 'property-cover') : null;
  const galleryRows = galleryIds.map((id) => resolveOne(id, 'property-image'));
  return {
    coverUrl: coverRow ? publicDeliveryUrl(coverRow) : '',
    galleryUrls: galleryRows.map(publicDeliveryUrl),
    uploads: [...(coverRow ? [coverRow] : []), ...galleryRows],
  };
};

// Phase 2 — deferred cleanup of replaced/removed entity media. Compares the
// entity's committed Upload rows against the URLs (or, for private assets
// with no delivery URL, the publicIds) it still references; rows no longer
// referenced flip to deleted + queued destroy (best-effort immediate destroy
// first). Legacy URLs with no Upload row are ignored — ownership
// unprovable, same as the old flow. Never throws.
const retireRemovedEntityUploads = async ({ entityType, entityId, keepUrls = [], keepPublicIds = [] }) => {
  try {
    const committed = await Upload.find({
      'committedTo.entityType': entityType,
      'committedTo.entityId': entityId,
      status: 'committed',
    }).select('_id publicId resourceType clientMeta');
    const { publicIdFromUrl } = require('../utils/cloudinary');
    const keepIds = new Set((keepUrls || []).filter(Boolean).map(publicIdFromUrl).filter(Boolean));
    for (const pid of keepPublicIds || []) {
      if (pid) keepIds.add(String(pid));
    }
    const keep = new Set((keepUrls || []).filter(Boolean));
    for (const row of committed) {
      // Match by publicId (robust to extension differences) or full URL.
      if (keepIds.has(row.publicId) || keep.has(publicDeliveryUrl(row))) continue; // eslint-disable-line no-continue
      row.status = 'deleted';
      row.destroyQueued = true;
      // eslint-disable-next-line no-await-in-loop
      await row.save();
      // eslint-disable-next-line no-await-in-loop
      const ok = await destroyByPublicId(row.publicId, row.resourceType);
      if (ok) {
        row.destroyQueued = false;
        // eslint-disable-next-line no-await-in-loop
        await row.save();
      } else {
        row.destroyAttempts += 1;
        row.lastError = 'retire destroy failed — queued for sweeper';
        // eslint-disable-next-line no-await-in-loop
        await row.save();
      }
    }
  } catch (err) {
    console.error(`Retire removed ${entityType} media failed:`, err.message);
  }
};

// Best-effort session close after a successful entity save. Never throws.
const closeSession = async (sessionId, actor) => {
  try {
    if (!sessionId || !mongoose.Types.ObjectId.isValid(String(sessionId))) return;
    const session = await UploadSession.findById(sessionId);
    if (!session || session.status !== 'open') return;
    if (String(session.userId) !== String(actor._id) && actor.role !== 'admin') return;
    session.status = 'closed';
    await session.save();
  } catch (err) {
    console.error('Upload session close failed:', err.message);
  }
};

module.exports = {
  isDirectUploadEnabled,
  createSession,
  signUpload,
  completeUpload,
  commitUploads,
  requestDelete,
  buildView,
  publicDeliveryUrl,
  resolvePropertyUploads,
  resolveHeroUploads,
  resolveBlogCover,
  resolveAvatar,
  resolveEmiSlip,
  assertEmiSlipAllowed,
  retireRemovedEntityUploads,
  destroyIfOrphaned,
  releaseEntityUploads,
  closeSession,
  ENTITY_PURPOSES,
};
