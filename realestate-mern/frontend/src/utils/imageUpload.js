import { useEffect, useState } from 'react';

// Phase 0 (direct-upload migration) shared client helpers for the legacy
// multipart flow. Validation mirrors the backend multer limits in
// backend/middleware/upload.js so oversized files fail fast in the browser
// instead of after a full upload to Render.

export const IMAGE_MIME_PREFIX = 'image/';

export const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Returns an error string, or '' when the file is acceptable.
export const validateImageFile = (file, { maxBytes, label = 'File' } = {}) => {
  if (!file) return `${label} is required`;
  if (!file.type || !file.type.startsWith(IMAGE_MIME_PREFIX)) {
    return `${label} must be a photo file (JPG, PNG, WEBP, GIF)`;
  }
  if (maxBytes && file.size > maxBytes) {
    return `${label} is too large (${formatBytes(file.size)}) — maximum is ${formatBytes(maxBytes)}`;
  }
  return '';
};

// Backend multer caps, duplicated here for client-side pre-checks only.
// The backend remains authoritative.
export const CLIENT_UPLOAD_LIMITS = {
  propertyImage: 10 * 1024 * 1024,
  heroImage: 10 * 1024 * 1024,
  heroVideo: 50 * 1024 * 1024,
  idPhoto: 2 * 1024 * 1024,
  paymentSlip: 5 * 1024 * 1024,
  avatar: 2 * 1024 * 1024,
  blogCover: 10 * 1024 * 1024,
  innovationImage: 10 * 1024 * 1024,
  innovationVideo: 50 * 1024 * 1024,
};

// Lightweight downscale for marketing photos (property gallery/cover, blog
// cover). Identity documents and slips are NOT compressed — legibility
// matters more than bytes there. Never throws: returns the original file
// when the browser can't process it.
export const downscaleImage = (
  file,
  { maxDimension = 1920, quality = 0.85, mimeType = 'image/jpeg' } = {}
) =>
  new Promise((resolve) => {
    if (!file || !file.type?.startsWith(IMAGE_MIME_PREFIX)) return resolve(file);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      const longest = Math.max(width, height);
      // Already small enough — skip re-encoding to preserve quality.
      if (longest <= maxDimension) return resolve(file);
      const scale = maxDimension / longest;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);
          const name = (file.name || 'photo').replace(/\.[a-zA-Z0-9]+$/, '') + '.jpg';
          resolve(new File([blob], name, { type: mimeType }));
        },
        mimeType,
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });

// Object-URL preview with automatic cleanup. Replaces ad-hoc
// URL.createObjectURL() calls in render paths (which leak and mint a new URL
// per render). Pass a File/Blob or null.
export const useObjectPreview = (fileOrBlob) => {
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!fileOrBlob) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(fileOrBlob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [fileOrBlob]);
  return preview;
};
