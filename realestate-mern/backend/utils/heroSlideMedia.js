const { publicIdFromUrl, destroyByPublicId } = require('./cloudinary');

// Destroys every Cloudinary asset referenced by a slide document.
// Prefers stored publicIds (exact even if the delivery URL changed);
// falls back to parsing the URLs.
const destroySlideMedia = async (slide) => {
  if (!slide || !slide.media) return;
  const mediaType = slide.media.type === 'video' ? 'video' : 'image';
  await destroyByPublicId(slide.media.publicId || publicIdFromUrl(slide.media.url), mediaType);
  await destroyByPublicId(
    slide.media.thumbnailPublicId || publicIdFromUrl(slide.media.thumbnailUrl),
    'image'
  );
};

// Destroys just-uploaded multer files (used to avoid orphaning a fresh
// upload when request validation fails afterwards). Multer-storage-cloudinary
// exposes the uploaded asset's public_id as file.filename.
const destroyUploadedFiles = async (files) => {
  if (!files) return;
  const all = [];
  if (Array.isArray(files.media)) all.push(...files.media);
  if (Array.isArray(files.thumbnail)) all.push(...files.thumbnail);
  for (const file of all) {
    const resourceType = file.mimetype && file.mimetype.startsWith('video/') ? 'video' : 'image';
    await destroyByPublicId(file.filename || publicIdFromUrl(file.path), resourceType);
  }
};

// Derived display state — computed at read time, never stored.
const effectiveState = (slide, now = new Date()) => {
  if (!slide || slide.status !== 'published') return 'draft';
  if (slide.startAt && slide.startAt > now) return 'scheduled';
  if (slide.endAt && slide.endAt < now) return 'expired';
  return 'active';
};

const isScheduleEligible = (slide, now = new Date()) =>
  slide &&
  slide.status === 'published' &&
  (!slide.startAt || slide.startAt <= now) &&
  (!slide.endAt || slide.endAt >= now);

// Public DTO — strips Cloudinary identifiers and audit fields. The public
// feed carries no data the homepage doesn't render.
const toPublicSlide = (slide) => ({
  _id: slide._id,
  title: slide.title,
  subtitle: slide.subtitle || '',
  description: slide.description || '',
  media: {
    type: slide.media.type,
    url: slide.media.url,
    thumbnailUrl: slide.media.thumbnailUrl || null,
    altText: slide.media.altText || '',
  },
  cta: {
    enabled: Boolean(slide.cta && slide.cta.enabled),
    label: (slide.cta && slide.cta.label) || '',
    actionType: (slide.cta && slide.cta.actionType) || 'none',
    actionValue: (slide.cta && slide.cta.actionValue) || '',
  },
  displayOrder: slide.displayOrder,
  duration: slide.duration,
});

module.exports = {
  publicIdFromUrl,
  destroyByPublicId,
  destroySlideMedia,
  destroyUploadedFiles,
  effectiveState,
  isScheduleEligible,
  toPublicSlide,
};
