// Upload-purpose matrix (Phase 1 of the direct-upload migration).
//
// The client sends only a semantic `purpose` (+ purpose-specific references
// such as mediaKind/docType). EVERYTHING below is backend-authoritative: the
// sign flow derives folder, public-ID prefix, resource type, MIME allowlist,
// size cap, delivery type, TTL and role gates from this table. Client values
// must never widen these constraints.

const MB = 1024 * 1024;

const envInt = (name, fallback) => {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

const TTL = {
  // Signature validity window (minutes) — bounds the upload authorization
  // window, NOT single-use (see services/uploadService.js).
  signatureMinutes: () => envInt('UPLOAD_SIGNATURE_TTL_MINUTES', 15),
  // Upload-record expiry (hours) — covers abandoned / completed-but-
  // uncommitted assets. Hero video gets longer for large files + review.
  resourceHours: () => envInt('UPLOAD_RESOURCE_TTL_HOURS', 24),
  videoResourceHours: () => envInt('UPLOAD_VIDEO_RESOURCE_TTL_HOURS', 48),
};

const PURPOSES = {
  'property-image': {
    folder: 'youth-real-estate/properties',
    idPrefix: 'prop',
    resourceType: 'image',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxBytes: 10 * MB,
    deliveryType: 'public',
    // admin may post without verification; agents/users need verified status
    requireVerified: true,
    roles: ['admin', 'agent', 'user'],
    maxPerSession: 15,
    entityType: 'property',
  },
  'property-cover': {
    folder: 'youth-real-estate/properties',
    idPrefix: 'prop-cover',
    resourceType: 'image',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxBytes: 10 * MB,
    deliveryType: 'public',
    requireVerified: true,
    roles: ['admin', 'agent', 'user'],
    maxPerSession: 1,
    entityType: 'property',
  },
  // mediaKind: 'image' | 'video' (required) selects the variant below.
  'hero-media': {
    mediaKinds: {
      image: {
        folder: 'youth-real-estate/hero-slides/images',
        idPrefix: 'hero',
        resourceType: 'image',
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        maxBytes: 10 * MB,
        ttlHours: () => TTL.resourceHours(),
      },
      video: {
        folder: 'youth-real-estate/hero-slides/videos',
        idPrefix: 'hero-vid',
        resourceType: 'video',
        allowedFormats: ['mp4', 'webm', 'mov'],
        maxBytes: 50 * MB,
        ttlHours: () => TTL.videoResourceHours(),
      },
    },
    deliveryType: 'public',
    roles: ['admin'],
    maxPerSession: 1,
    entityType: 'heroslide',
  },
  'hero-thumbnail': {
    folder: 'youth-real-estate/hero-slides/images',
    idPrefix: 'hero-thumb',
    resourceType: 'image',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxBytes: 10 * MB,
    deliveryType: 'public',
    roles: ['admin'],
    maxPerSession: 1,
    entityType: 'heroslide',
  },
  'blog-cover': {
    folder: 'youth-real-estate/blog',
    idPrefix: 'blog',
    resourceType: 'image',
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    maxBytes: 10 * MB,
    deliveryType: 'public',
    roles: ['admin'],
    maxPerSession: 1,
    entityType: 'blog',
  },
  avatar: {
    folder: 'youth-real-estate/avatars',
    idPrefix: 'avatar',
    resourceType: 'image',
    allowedFormats: ['png', 'jpg', 'jpeg', 'webp'],
    maxBytes: 2 * MB,
    deliveryType: 'public',
    roles: ['admin', 'agent', 'user'],
    maxPerSession: 1,
    entityType: 'user',
  },
  // docType: 'selfie' | 'citizenship-front' | 'citizenship-back' (required).
  // Restricted delivery — Phase 5 must confirm private delivery + signed
  // viewing on the current Cloudinary plan before migrating this surface.
  'verification-document': {
    folder: 'youth-real-estate/verification',
    idPrefix: 'verify',
    resourceType: 'image',
    allowedFormats: ['png', 'jpg', 'jpeg', 'webp'],
    maxBytes: 2 * MB,
    deliveryType: 'private',
    roles: ['admin', 'agent', 'user'],
    maxPerSession: 3,
    entityType: 'user',
    docTypes: ['selfie', 'citizenship-front', 'citizenship-back'],
  },
  // Restricted delivery, same mechanism as verification documents.
  // Buyer-role only (mirrors POST verification-request's authorize('user'));
  // plan/installment ownership is enforced at sign AND submit, not just role.
  'emi-slip': {
    folder: 'youth-real-estate/emi-payment-slips',
    idPrefix: 'emi-slip',
    resourceType: 'image',
    allowedFormats: ['png', 'jpg', 'jpeg', 'webp'],
    maxBytes: 5 * MB,
    deliveryType: 'private',
    roles: ['user'],
    maxPerSession: 1,
    entityType: 'emi-installment',
  },
};

// Upload-session scopes → purposes allowed inside the session.
const SESSION_SCOPES = {
  property: ['property-image', 'property-cover'],
  hero: ['hero-media', 'hero-thumbnail'],
  blog: ['blog-cover'],
  avatar: ['avatar'],
  verification: ['verification-document'],
  emi: ['emi-slip'],
};

const isVerifiedForPurpose = (user, purpose) => {
  const def = PURPOSES[purpose];
  if (!def) return false;
  if (!def.requireVerified) return true;
  if (user.role === 'admin') return true;
  return user.verificationStatus === 'verified';
};

module.exports = { PURPOSES, SESSION_SCOPES, TTL };
module.exports.isVerifiedForPurpose = isVerifiedForPurpose;
