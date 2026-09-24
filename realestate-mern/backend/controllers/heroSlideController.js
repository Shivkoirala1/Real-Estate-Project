const mongoose = require('mongoose');
const HeroSlide = require('../models/HeroSlide');
const Property = require('../models/Property');
const asyncHandler = require('../utils/asyncHandler');
const {
  destroyByPublicId,
  destroySlideMedia,
  destroyUploadedFiles,
  effectiveState,
  toPublicSlide,
} = require('../utils/heroSlideMedia');
// Phase 3 direct-upload: hero media may arrive as authorized uploadIds
// (browser → Cloudinary) instead of multipart bytes (browser → Render).
// Legacy req.files handling stays intact behind HERO_DIRECT_UPLOAD_ENABLED.
const {
  resolveHeroUploads,
  commitUploads,
  retireRemovedEntityUploads,
  destroyIfOrphaned,
  releaseEntityUploads,
  closeSession,
} = require('../services/uploadService');
const { recordHeroSubmit } = require('../utils/uploadMetrics');

const isHeroDirectEnabled = () => process.env.HERO_DIRECT_UPLOAD_ENABLED !== 'false';

const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // consistent with property photos
const URL_RE = /^https?:\/\/.+/i;

// A linked property stays promotable while a visitor could plausibly land
// on it: exists, approved, not archived, and holding a non-terminal status.
// Sold/rented/deleted (decision 2b) drop the slide from the public feed.
const isPropertyPromotable = (property) =>
  Boolean(
    property &&
      property.isApproved &&
      !property.isArchived &&
      ['available', 'reserved'].includes(property.status)
  );

const parseDateParam = (value, field, errors) => {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field} is not a valid date`);
    return undefined;
  }
  return date;
};

const parseIntParam = (value, field, { min, max } = {}, errors) => {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isInteger(num)) {
    errors.push(`${field} must be a whole number`);
    return undefined;
  }
  if (min !== undefined && num < min) errors.push(`${field} cannot be less than ${min}`);
  if (max !== undefined && num > max) errors.push(`${field} cannot exceed ${max}`);
  return num;
};

// Shared body validation for create/update. Returns { errors, normalized }.
// Property existence/eligibility is checked by the caller (async).
const validateSlideBody = (body, { isUpdate = false } = {}) => {
  const errors = [];
  const normalized = {};

  if (body.title !== undefined) {
    if (!String(body.title).trim()) errors.push('Slide title is required');
    else if (String(body.title).trim().length > 120) errors.push('Title cannot exceed 120 characters');
    else normalized.title = String(body.title).trim();
  } else if (!isUpdate) {
    errors.push('Slide title is required');
  }

  if (body.subtitle !== undefined) {
    if (String(body.subtitle).length > 160) errors.push('Subtitle cannot exceed 160 characters');
    else normalized.subtitle = String(body.subtitle);
  }
  if (body.description !== undefined) {
    if (String(body.description).length > 500) errors.push('Description cannot exceed 500 characters');
    else normalized.description = String(body.description);
  }
  if (body.altText !== undefined) {
    if (String(body.altText).length > 160) errors.push('Alt text cannot exceed 160 characters');
    else normalized.altText = String(body.altText);
  }

  const startAt = body.startAt !== undefined ? parseDateParam(body.startAt, 'startAt', errors) : undefined;
  const endAt = body.endAt !== undefined ? parseDateParam(body.endAt, 'endAt', errors) : undefined;
  if (startAt !== undefined) normalized.startAt = startAt;
  if (endAt !== undefined) normalized.endAt = endAt;
  const effStart = normalized.startAt;
  const effEnd = normalized.endAt;
  if (effStart && effEnd && effStart >= effEnd) {
    errors.push('End date must be after the start date');
  }

  const duration = body.duration !== undefined ? parseIntParam(body.duration, 'duration', { min: 3, max: 60 }, errors) : undefined;
  if (duration !== undefined) normalized.duration = duration;

  const displayOrder =
    body.displayOrder !== undefined ? parseIntParam(body.displayOrder, 'displayOrder', { min: 0 }, errors) : undefined;
  if (displayOrder !== undefined) normalized.displayOrder = displayOrder;

  if (body.status !== undefined) {
    if (!['draft', 'published'].includes(body.status)) errors.push('Status must be draft or published');
    else normalized.status = body.status;
  }

  // CTA (scalar parts; property eligibility resolved by the caller).
  const ctaIn = body.cta !== undefined ? body.cta : undefined;
  // Accept both nested `cta` object and flat fields (multipart forms send flat fields).
  const enabledRaw = ctaIn && ctaIn.enabled !== undefined ? ctaIn.enabled : body.ctaEnabled;
  const typeRaw = ctaIn && ctaIn.actionType !== undefined ? ctaIn.actionType : body.ctaActionType;
  const valueRaw = ctaIn && ctaIn.actionValue !== undefined ? ctaIn.actionValue : body.ctaActionValue;
  const labelRaw = ctaIn && ctaIn.label !== undefined ? ctaIn.label : body.ctaLabel;

  if (enabledRaw !== undefined || typeRaw !== undefined || valueRaw !== undefined || labelRaw !== undefined) {
    const enabled = enabledRaw === true || enabledRaw === 'true';
    const actionType = typeRaw !== undefined && typeRaw !== '' ? String(typeRaw) : 'none';
    const actionValue = valueRaw !== undefined && valueRaw !== null ? String(valueRaw).trim() : '';
    const label = labelRaw !== undefined && labelRaw !== null ? String(labelRaw).trim() : '';
    if (!['property', 'url', 'none'].includes(actionType)) {
      errors.push('CTA action must be property, url or none');
    } else if (enabled) {
      if (actionType === 'none') errors.push('Enabled CTA needs a property or URL destination (or disable the CTA)');
      if (!label) errors.push('CTA label is required when the CTA is enabled');
      else if (label.length > 40) errors.push('CTA label cannot exceed 40 characters');
      if (actionType === 'url' && !URL_RE.test(actionValue)) {
        errors.push('CTA URL must be a valid http(s) URL');
      }
      if (actionType === 'property' && !actionValue) {
        errors.push('CTA property is required for a property action');
      }
    }
    normalized.cta = { enabled, label, actionType, actionValue: enabled ? actionValue : '' };
  }

  return { errors, normalized };
};

// Resolves + validates the CTA property reference. Returns the property id
// string (or null) or sends the error response itself (returns `handled`).
const resolveCtaProperty = async (cta, currentPropertyId, res) => {
  if (!cta || cta.actionType !== 'property') {
    return { propertyId: cta && cta.actionType === 'none' ? null : currentPropertyId, handled: false };
  }
  if (!mongoose.Types.ObjectId.isValid(cta.actionValue)) {
    res.status(400).json({ success: false, message: 'CTA property is not a valid property id' });
    return { handled: true };
  }
  const property = await Property.findById(cta.actionValue).select('status isApproved isArchived');
  if (!property) {
    res.status(404).json({ success: false, message: 'Linked property not found' });
    return { handled: true };
  }
  if (!isPropertyPromotable(property)) {
    res.status(400).json({ success: false, message: 'Linked property is not available for promotion' });
    return { handled: true };
  }
  return { propertyId: property._id, handled: false };
};

const failValidation = async (res, files, errors) => {
  await destroyUploadedFiles(files);
  return res.status(400).json({ success: false, message: errors.join(', ') });
};

// @desc    Public carousel feed — only currently eligible slides, display order
// @route   GET /api/hero-slides
// @access  Public
const getHeroSlides = asyncHandler(async (req, res) => {
  const now = new Date();
  const slides = await HeroSlide.find({
    status: 'published',
    $and: [
      { $or: [{ startAt: null }, { startAt: { $lte: now } }] },
      { $or: [{ endAt: null }, { endAt: { $gte: now } }] },
    ],
  })
    .sort({ displayOrder: 1, createdAt: 1 })
    .limit(20)
    .lean();

  const propertyIds = [...new Set(slides.filter((s) => s.property).map((s) => String(s.property)))];
  let promotableById = new Map();
  if (propertyIds.length > 0) {
    const properties = await Property.find({ _id: { $in: propertyIds } }).select(
      'status isApproved isArchived'
    );
    promotableById = new Map(properties.map((p) => [String(p._id), isPropertyPromotable(p)]));
  }

  const eligible = slides.filter((slide) => {
    if (!slide.property) return true;
    return promotableById.get(String(slide.property)) === true;
  });

  res.json({ success: true, count: eligible.length, slides: eligible.map(toPublicSlide) });
});

// @desc    Admin slide list (all states) with pagination + filters
// @route   GET /api/hero-slides/admin?status=&search=&page=&limit=
// @access  Private (admin)
const getAdminHeroSlides = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
  const skip = (page - 1) * limit;
  const { status, search } = req.query;

  const filter = {};
  if (status && ['draft', 'published'].includes(status)) filter.status = status;
  if (search) filter.title = { $regex: search, $options: 'i' };

  const [slides, total] = await Promise.all([
    HeroSlide.find(filter).sort({ displayOrder: 1, createdAt: 1 }).skip(skip).limit(limit),
    HeroSlide.countDocuments(filter),
  ]);

  const now = new Date();
  const totalPages = Math.ceil(total / limit);
  res.json({
    success: true,
    slides: slides.map((slide) => ({
      ...slide.toObject(),
      effectiveState: effectiveState(slide, now),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  });
});

// @desc    Admin gets one slide
// @route   GET /api/hero-slides/:id
// @access  Private (admin)
const getHeroSlideById = asyncHandler(async (req, res) => {
  const slide = await HeroSlide.findById(req.params.id);
  if (!slide) return res.status(404).json({ success: false, message: 'Hero slide not found' });
  res.json({ success: true, slide: { ...slide.toObject(), effectiveState: effectiveState(slide) } });
});

// @desc    Admin creates a slide (multipart: media + optional thumbnail)
// @route   POST /api/hero-slides
// @access  Private (admin)
const createHeroSlide = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const clientStats = req.body.clientStats && typeof req.body.clientStats === 'object' ? req.body.clientStats : {};
  const files = req.files || {};
  const { errors, normalized } = validateSlideBody(req.body);

  // Direct flow: media arrives as authorized uploadIds (no bytes through
  // Render). Legacy flow: multer already streamed req.files to Cloudinary.
  const directRequested = req.body.mediaUploadId !== undefined || req.body.thumbnailUploadId !== undefined;
  let direct = null;
  if (directRequested) {
    if (!isHeroDirectEnabled()) {
      recordHeroSubmit('direct', { durationMs: Date.now() - startedAt, outcome: 'error', clientStats });
      return res.status(400).json({ success: false, message: 'Direct hero upload is disabled — please use the standard media upload' });
    }
    try {
      direct = await resolveHeroUploads({
        actor: req.user,
        sessionId: req.body.uploadSessionId,
        mediaUploadId: req.body.mediaUploadId,
        thumbnailUploadId: req.body.thumbnailUploadId,
        mediaType: req.body.mediaType,
        requireMedia: true,
      });
    } catch (err) {
      recordHeroSubmit('direct', { durationMs: Date.now() - startedAt, outcome: 'validation', clientStats });
      throw err;
    }
  }

  const mediaFile = Array.isArray(files.media) ? files.media[0] : null;
  if (direct ? !direct.mediaUrl : !mediaFile) errors.push('Slide media file is required');

  let mediaType = direct ? direct.mediaResourceType : null;
  if (mediaFile) {
    if (mediaFile.mimetype.startsWith('video/')) mediaType = 'video';
    else if (mediaFile.mimetype.startsWith('image/')) mediaType = 'image';
    if (req.body.mediaType && req.body.mediaType !== mediaType) {
      errors.push('Media type does not match the uploaded file');
    }
    if (mediaType === 'image' && mediaFile.size > IMAGE_MAX_BYTES) {
      errors.push('Image files cannot exceed 10MB (use video for larger motion media)');
    }
  }

  if (errors.length > 0) {
    // Direct uploads stay `completed` — resubmit reuses the ids, no re-upload.
    if (direct) {
      recordHeroSubmit('direct', {
        durationMs: Date.now() - startedAt,
        kind: direct.mediaResourceType || '',
        hasThumbnail: Boolean(direct.thumbUrl),
        bytes: direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0),
        outcome: 'validation',
        clientStats,
      });
      return res.status(400).json({ success: false, message: errors.join(', ') });
    }
    return failValidation(res, files, errors);
  }

  const cta = normalized.cta || { enabled: false, label: '', actionType: 'none', actionValue: '' };
  const { propertyId, handled } = await resolveCtaProperty(cta, null, res);
  if (handled) {
    await destroyUploadedFiles(files);
    return;
  }

  const thumbnailFile = Array.isArray(files.thumbnail) ? files.thumbnail[0] : null;

  const count = await HeroSlide.estimatedDocumentCount();
  const slide = new HeroSlide({
    title: normalized.title,
    subtitle: normalized.subtitle ?? '',
    description: normalized.description ?? '',
    media: {
      type: mediaType,
      url: direct ? direct.mediaUrl : mediaFile.path,
      publicId: direct ? direct.mediaPublicId : mediaFile.filename || null,
      thumbnailUrl: direct ? direct.thumbUrl : thumbnailFile ? thumbnailFile.path : null,
      thumbnailPublicId: direct ? direct.thumbPublicId : thumbnailFile ? thumbnailFile.filename || null : null,
      altText: normalized.altText ?? '',
    },
    cta: { ...cta, actionValue: cta.actionType === 'property' && propertyId ? String(propertyId) : cta.actionValue },
    property: cta.actionType === 'property' ? propertyId : null,
    startAt: normalized.startAt ?? null,
    endAt: normalized.endAt ?? null,
    displayOrder: normalized.displayOrder ?? count + 1,
    duration: normalized.duration ?? 5,
    status: normalized.status || 'draft',
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  try {
    await slide.save();
  } catch (err) {
    if (direct) {
      // Uploads stay committed-less (completed) — resubmit reuses them.
      // The unsaved slide never exists, so nothing dangles.
      recordHeroSubmit('direct', {
        durationMs: Date.now() - startedAt,
        kind: direct.mediaResourceType || '',
        hasThumbnail: Boolean(direct.thumbUrl),
        bytes: direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0),
        outcome: 'error',
        clientStats,
      });
      throw err;
    }
    await destroyUploadedFiles(files);
    throw err;
  }

  if (direct && direct.uploads.length > 0) {
    // Commit AFTER create (the entity must exist first). On commit failure
    // the just-created slide is removed again — same compensation as the
    // Phase 2 property flow.
    try {
      await commitUploads({
        actor: req.user,
        sessionId: req.body.uploadSessionId,
        uploadIds: direct.uploads.map((u) => String(u._id)),
        entityType: 'heroslide',
        entityId: String(slide._id),
      });
    } catch (err) {
      await HeroSlide.deleteOne({ _id: slide._id });
      recordHeroSubmit('direct', {
        durationMs: Date.now() - startedAt,
        kind: direct.mediaResourceType || '',
        hasThumbnail: Boolean(direct.thumbUrl),
        bytes: direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0),
        outcome: 'error',
        clientStats,
      });
      throw err;
    }
    await closeSession(req.body.uploadSessionId, req.user);
  }

  if (direct) {
    recordHeroSubmit('direct', {
      durationMs: Date.now() - startedAt,
      kind: direct.mediaResourceType || '',
      hasThumbnail: Boolean(direct.thumbUrl),
      bytes: direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0),
      outcome: 'success',
      clientStats,
    });
  } else {
    recordHeroSubmit('legacy', {
      durationMs: Date.now() - startedAt,
      kind: mediaType || '',
      hasThumbnail: Boolean(thumbnailFile),
      bytes: (mediaFile ? mediaFile.size || 0 : 0) + (thumbnailFile ? thumbnailFile.size || 0 : 0),
      outcome: 'success',
    });
  }

  res.status(201).json({ success: true, message: 'Hero slide created successfully', slide });
});

// @desc    Admin updates a slide; new media files replace existing assets
// @route   PUT /api/hero-slides/:id
// @access  Private (admin)
const updateHeroSlide = asyncHandler(async (req, res) => {
  const startedAt = Date.now();
  const clientStats = req.body.clientStats && typeof req.body.clientStats === 'object' ? req.body.clientStats : {};
  const slide = await HeroSlide.findById(req.params.id);
  if (!slide) {
    await destroyUploadedFiles(req.files);
    return res.status(404).json({ success: false, message: 'Hero slide not found' });
  }

  const files = req.files || {};
  const { errors, normalized } = validateSlideBody(req.body, { isUpdate: true });

  const directRequested = req.body.mediaUploadId !== undefined || req.body.thumbnailUploadId !== undefined;
  let direct = null;
  if (directRequested) {
    if (!isHeroDirectEnabled()) {
      recordHeroSubmit('direct', { durationMs: Date.now() - startedAt, outcome: 'error', clientStats });
      return res.status(400).json({ success: false, message: 'Direct hero upload is disabled — please use the standard media upload' });
    }
    try {
      direct = await resolveHeroUploads({
        actor: req.user,
        sessionId: req.body.uploadSessionId,
        mediaUploadId: req.body.mediaUploadId,
        thumbnailUploadId: req.body.thumbnailUploadId,
        mediaType: req.body.mediaType,
        requireMedia: false,
        forEntityId: slide._id,
      });
    } catch (err) {
      recordHeroSubmit('direct', { durationMs: Date.now() - startedAt, outcome: 'validation', clientStats });
      throw err;
    }
  }

  const mediaFile = Array.isArray(files.media) ? files.media[0] : null;
  let mediaType = direct && direct.mediaUrl ? direct.mediaResourceType : null;
  if (mediaFile) {
    if (mediaFile.mimetype.startsWith('video/')) mediaType = 'video';
    else if (mediaFile.mimetype.startsWith('image/')) mediaType = 'image';
    if (req.body.mediaType && req.body.mediaType !== mediaType) {
      errors.push('Media type does not match the uploaded file');
    }
    if (mediaType === 'image' && mediaFile.size > IMAGE_MAX_BYTES) {
      errors.push('Image files cannot exceed 10MB (use video for larger motion media)');
    }
  }
  const thumbnailFile = Array.isArray(files.thumbnail) ? files.thumbnail[0] : null;
  const newMedia = direct ? Boolean(direct.mediaUrl) : Boolean(mediaFile);
  const newThumbnail = direct ? Boolean(direct.thumbUrl) : Boolean(thumbnailFile);

  // Schedule cross-check against the merged (existing + incoming) bounds.
  const mergedStart = normalized.startAt !== undefined ? normalized.startAt : slide.startAt;
  const mergedEnd = normalized.endAt !== undefined ? normalized.endAt : slide.endAt;
  if (mergedStart && mergedEnd && mergedStart >= mergedEnd) {
    errors.push('End date must be after the start date');
  }

  // Only re-resolve the property link when the CTA itself changed — this
  // keeps unrelated edits (e.g. fixing a title) working even if the linked
  // property has since become unpromotable (the public feed already
  // excludes such slides).
  let nextProperty = slide.property;
  let nextCta = null;
  if (normalized.cta) {
    const explicit = normalized.cta;
    if (explicit.actionType === 'property') {
      const { propertyId, handled } = await resolveCtaProperty(explicit, slide.property, res);
      if (handled) {
        await destroyUploadedFiles(files);
        return;
      }
      nextProperty = propertyId;
      nextCta = { ...explicit, actionValue: String(propertyId) };
    } else {
      nextProperty = null;
      nextCta = { ...explicit, actionValue: explicit.actionType === 'url' ? explicit.actionValue : '' };
    }
  }

  const oldMedia = newMedia
    ? { publicId: slide.media.publicId, url: slide.media.url, resourceType: slide.media.type }
    : null;
  const oldThumbnail =
    newThumbnail && slide.media.thumbnailPublicId
      ? { publicId: slide.media.thumbnailPublicId, url: slide.media.thumbnailUrl }
      : null;

  if (direct && direct.uploads.length > 0) {
    // New flow surfaces body-validation problems BEFORE committing, so a
    // 400 never consumes uploads (resubmit reuses the ids). Legacy behavior
    // below is untouched.
    if (errors.length > 0) {
      recordHeroSubmit('direct', {
        durationMs: Date.now() - startedAt,
        kind: direct.mediaResourceType || slide.media.type,
        hasThumbnail: newThumbnail || Boolean(slide.media.thumbnailUrl),
        bytes: direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0),
        outcome: 'validation',
        clientStats,
      });
      return res.status(400).json({ success: false, message: errors.join(', ') });
    }
    // Commit BEFORE save here (the entity already exists). A save failure
    // afterwards leaves committed rows pointing at valid Cloudinary bytes —
    // the next update's retire pass reconciles, and existing slide media is
    // untouched, so the live slide never breaks.
    try {
      await commitUploads({
        actor: req.user,
        sessionId: req.body.uploadSessionId,
        uploadIds: direct.uploads.map((u) => String(u._id)),
        entityType: 'heroslide',
        entityId: String(slide._id),
      });
    } catch (err) {
      recordHeroSubmit('direct', {
        durationMs: Date.now() - startedAt,
        kind: direct.mediaResourceType || slide.media.type,
        hasThumbnail: newThumbnail || Boolean(slide.media.thumbnailUrl),
        bytes: direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0),
        outcome: 'error',
        clientStats,
      });
      throw err;
    }
  }

  if (normalized.title !== undefined) slide.title = normalized.title;
  if (normalized.subtitle !== undefined) slide.subtitle = normalized.subtitle;
  if (normalized.description !== undefined) slide.description = normalized.description;
  if (normalized.altText !== undefined) slide.media.altText = normalized.altText;
  if (normalized.startAt !== undefined) slide.startAt = normalized.startAt;
  if (normalized.endAt !== undefined) slide.endAt = normalized.endAt;
  if (normalized.duration !== undefined) slide.duration = normalized.duration;
  if (normalized.displayOrder !== undefined) slide.displayOrder = normalized.displayOrder;
  if (normalized.status !== undefined) slide.status = normalized.status;
  if (normalized.cta) {
    slide.cta = nextCta;
    slide.property = nextProperty;
  }
  if (mediaFile) {
    slide.media.type = mediaType;
    slide.media.url = mediaFile.path;
    slide.media.publicId = mediaFile.filename || null;
  } else if (direct && direct.mediaUrl) {
    slide.media.type = direct.mediaResourceType;
    slide.media.url = direct.mediaUrl;
    slide.media.publicId = direct.mediaPublicId;
  }
  if (thumbnailFile) {
    slide.media.thumbnailUrl = thumbnailFile.path;
    slide.media.thumbnailPublicId = thumbnailFile.filename || null;
  } else if (direct && direct.thumbUrl) {
    slide.media.thumbnailUrl = direct.thumbUrl;
    slide.media.thumbnailPublicId = direct.thumbPublicId;
  }
  slide.updatedBy = req.user._id;

  try {
    await slide.save();
  } catch (err) {
    if (direct) {
      recordHeroSubmit('direct', {
        durationMs: Date.now() - startedAt,
        kind: direct.mediaResourceType || slide.media.type,
        hasThumbnail: newThumbnail || Boolean(slide.media.thumbnailUrl),
        bytes: direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0),
        outcome: 'error',
        clientStats,
      });
      throw err;
    }
    await destroyUploadedFiles(files);
    throw err;
  }

  if (direct) {
    // Replacement lifecycle (deferred, never on the critical path):
    // committed rows no longer referenced are retired via the sweeper
    // pattern; replaced LEGACY bytes (no Upload row) are destroyed here.
    await retireRemovedEntityUploads({
      entityType: 'heroslide',
      entityId: slide._id,
      keepUrls: [slide.media.url, slide.media.thumbnailUrl],
    });
    if (oldMedia) {
      await destroyIfOrphaned({
        publicId: oldMedia.publicId,
        entityId: slide._id,
        resourceType: oldMedia.resourceType === 'video' ? 'video' : 'image',
      });
    }
    if (oldThumbnail) {
      await destroyIfOrphaned({ publicId: oldThumbnail.publicId, entityId: slide._id, resourceType: 'image' });
    }
    await closeSession(req.body.uploadSessionId, req.user);
    recordHeroSubmit('direct', {
      durationMs: Date.now() - startedAt,
      kind: slide.media.type,
      hasThumbnail: Boolean(slide.media.thumbnailUrl),
      bytes: direct.uploads.reduce((s, u) => s + (u.clientMeta.bytes || 0), 0),
      outcome: 'success',
      clientStats,
    });
    return res.json({ success: true, message: 'Hero slide updated successfully', slide });
  }

  // Replacement lifecycle: old bytes are deleted only after the new upload
  // and the database update both succeed.
  if (oldMedia) {
    await destroyByPublicId(
      oldMedia.publicId,
      oldMedia.resourceType === 'video' ? 'video' : 'image'
    );
  }
  if (oldThumbnail) await destroyByPublicId(oldThumbnail.publicId, 'image');

  recordHeroSubmit('legacy', {
    durationMs: Date.now() - startedAt,
    kind: slide.media.type,
    hasThumbnail: Boolean(slide.media.thumbnailUrl),
    bytes: (mediaFile ? mediaFile.size || 0 : 0) + (thumbnailFile ? thumbnailFile.size || 0 : 0),
    outcome: 'success',
  });

  res.json({ success: true, message: 'Hero slide updated successfully', slide });
});

// @desc    Admin deletes a slide and its media bytes
// @route   DELETE /api/hero-slides/:id
// @access  Private (admin)
const deleteHeroSlide = asyncHandler(async (req, res) => {
  const slide = await HeroSlide.findById(req.params.id);
  if (!slide) return res.status(404).json({ success: false, message: 'Hero slide not found' });
  await destroySlideMedia(slide);
  await slide.deleteOne();
  // Bookkeeping for direct-upload rows: bytes were just destroyed above via
  // the stored publicIds, so release the rows without re-destroying.
  await releaseEntityUploads({ entityType: 'heroslide', entityId: slide._id });
  res.json({ success: true, message: 'Hero slide deleted successfully' });
});

// @desc    Admin reorders slides with numeric positions; normalized sequential
// @route   PUT /api/hero-slides/reorder { order: [{ id, displayOrder }] }
// @access  Private (admin)
const reorderHeroSlides = asyncHandler(async (req, res) => {
  const order = req.body.order;
  if (!Array.isArray(order) || order.length === 0) {
    return res.status(400).json({ success: false, message: 'Order array is required' });
  }
  const ids = order.map((entry) => entry && entry.id);
  if (ids.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return res.status(400).json({ success: false, message: 'Order contains an invalid slide id' });
  }
  const slides = await HeroSlide.find({ _id: { $in: ids } });
  if (slides.length !== new Set(ids.map(String)).size) {
    return res.status(404).json({ success: false, message: 'One or more slides were not found' });
  }

  const byId = new Map(slides.map((slide) => [String(slide._id), slide]));
  for (const entry of order) {
    const num = Number(entry.displayOrder);
    if (!Number.isInteger(num) || num < 0) {
      return res.status(400).json({ success: false, message: 'displayOrder must be a whole number >= 0' });
    }
    byId.get(String(entry.id)).displayOrder = num;
  }
  await Promise.all(slides.map((slide) => slide.save()));

  // Normalize every slide to gapless 1..n positions so numeric editing can
  // never leave duplicates or holes.
  const all = await HeroSlide.find({}).sort({ displayOrder: 1, createdAt: 1 });
  await Promise.all(
    all.map((slide, index) => {
      slide.displayOrder = index + 1;
      return slide.save();
    })
  );

  const refreshed = await HeroSlide.find({}).sort({ displayOrder: 1, createdAt: 1 });
  res.json({ success: true, message: 'Hero slides reordered successfully', slides: refreshed });
});

module.exports = {
  getHeroSlides,
  getAdminHeroSlides,
  getHeroSlideById,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  reorderHeroSlides,
};
