const cloudinary = require('cloudinary').v2;

// Centralized Cloudinary client (Phase 1 of the direct-upload migration).
// Previously each consumer configured its own instance
// (middleware/upload.js, utils/heroSlideMedia.js,
// utils/verificationRetention.js). New upload infrastructure imports from
// here; the legacy consumers are refactored onto these shared helpers so
// destroy/parse behavior stays identical everywhere.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Extracts a Cloudinary public_id from a delivery URL so the bytes can be
// destroyed. Returns null for non-Cloudinary URLs (legacy /uploads paths,
// external links), which are simply unlinked rather than deleted.
const publicIdFromUrl = (url) => {
  if (typeof url !== 'string' || !url.includes('res.cloudinary.com')) return null;
  const marker = '/upload/';
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  let rest = url.slice(idx + marker.length).split('?')[0];
  rest = rest.replace(/^v\d+\//, '');
  rest = rest.replace(/\.[a-zA-Z0-9]+$/, '');
  return rest || null;
};

// Best-effort Cloudinary destroy — never throws, so media cleanup can
// never break an API response. Returns true on success, false otherwise
// (callers queue a retry via the upload sweeper on false).
const destroyByPublicId = async (publicId, resourceType = 'image') => {
  if (!publicId) return true;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return true;
  } catch (err) {
    console.error(`Cloudinary cleanup failed (${publicId}):`, err.message);
    return false;
  }
};

// Local HMAC signature for a direct browser-to-Cloudinary upload. Pure
// computation — no network. The api_secret never leaves the backend; only
// cloud_name + api_key (public by design) are exposed to the browser.
const signUploadParams = (paramsToSign) =>
  cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);

// Short-lived signed delivery URL for restricted (private) assets.
// Verification/EMI-slip viewing goes through backend authZ first.
const privateDownloadUrl = (publicId, { format = 'jpg', resourceType = 'image', expiresAt } = {}) =>
  cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType,
    type: 'private',
    expires_at: expiresAt,
  });

module.exports = {
  cloudinary,
  publicIdFromUrl,
  destroyByPublicId,
  signUploadParams,
  privateDownloadUrl,
};
