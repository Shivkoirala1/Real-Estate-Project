const mongoose = require('mongoose');
const InnovationIdea = require('../models/InnovationIdea');
const asyncHandler = require('../utils/asyncHandler');
// Direct-upload lifecycle: media arrives as authorized uploadIds resolved
// here into server-derived Cloudinary URLs. The controller never trusts
// client-supplied media URLs.
const {
  resolveInnovationUploads,
  commitUploads,
  retireRemovedEntityUploads,
  releaseEntityUploads,
  closeSession,
} = require('../services/uploadService');
const { publicIdFromUrl, destroyByPublicId } = require('../utils/cloudinary');

const SUBMITTER_POPULATE = 'name email';
// Public surfaces expose the author name only (blog/property convention) —
// email stays on admin/owner write responses and the admin list.
const SUBMITTER_PUBLIC_POPULATE = 'name';

// 5 submissions per user per rolling 24 hours (V1 decision). DB-backed like
// the contact-form cooldown so it holds across instances; the in-memory
// sign limiter is only for upload signatures, not submissions.
const CREATE_LIMIT = 5;
const CREATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Title + description partial match (property-search convention —
// deliberately not $text, which needs an index and whole-word matches).
const searchFilter = (q) => {
  if (!q || !String(q).trim()) return {};
  const regex = new RegExp(escapeRegExp(String(q).trim()), 'i');
  return { $or: [{ title: regex }, { description: regex }] };
};

const parsePagination = (query, defaultLimit = 12, maxLimit = 50) => {
  const pageNum = Math.max(Number(query.page) || 1, 1);
  const limitNum = Math.min(Math.max(Number(query.limit) || defaultLimit, 1), maxLimit);
  return { pageNum, limitNum, skip: (pageNum - 1) * limitNum };
};

const paginationOf = (total, pageNum, limitNum) => ({
  total,
  pages: Math.ceil(total / limitNum) || 1,
  currentPage: pageNum,
  limit: limitNum,
});

const isOwnerOrAdmin = (idea, user) =>
  user.role === 'admin' || String(idea.submittedBy) === String(user._id);

// Throws 429 with Retry-After metadata when the user exhausted their
// creation quota. Checked after validation/media resolution so only
// submittable requests are subject to the limit.
const assertCreateQuota = async (res, userId) => {
  const since = new Date(Date.now() - CREATE_WINDOW_MS);
  const count = await InnovationIdea.countDocuments({ submittedBy: userId, createdAt: { $gt: since } });
  if (count < CREATE_LIMIT) return;
  const oldest = await InnovationIdea.findOne({ submittedBy: userId, createdAt: { $gt: since } })
    .sort({ createdAt: 1 })
    .select('createdAt');
  const retryAfterSec = oldest
    ? Math.max(Math.ceil((oldest.createdAt.getTime() + CREATE_WINDOW_MS - Date.now()) / 1000), 1)
    : 60;
  res.set('Retry-After', String(retryAfterSec));
  return res.status(429).json({
    success: false,
    message: 'You have reached the limit of 5 innovation submissions per 24 hours — please try again later',
    retryAfterSec,
  });
};

// Derives a video poster frame from the committed Cloudinary video asset
// (so_0 = first frame). No separate thumbnail upload exists in V1.
const videoThumbnailFor = (videoUpload, videoUrl) => {
  const publicId = videoUpload?.publicId || publicIdFromUrl(videoUrl);
  if (!publicId) return null;
  const cloud = process.env.CLOUDINARY_CLOUD_NAME || 'demo';
  return `https://res.cloudinary.com/${cloud}/video/upload/so_0/${publicId}.jpg`;
};

// @desc    Submit a new innovation idea (immediately public)
// @route   POST /api/innovations
// @access  Private (verified user, admin — agents blocked at the route)
const createInnovation = asyncHandler(async (req, res) => {
  const { title, category, description, uploadSessionId, imageUploadIds, videoUploadId } = req.body || {};

  // Media is optional (none / images / video / both). Resolution enforces
  // ownership, session, purpose, completion, expiry and the 5-image cap.
  const hasMedia =
    (Array.isArray(imageUploadIds) && imageUploadIds.length > 0) || videoUploadId !== undefined;
  if (Array.isArray(videoUploadId)) {
    return res.status(400).json({ success: false, message: 'Only one video is allowed per idea' });
  }
  let resolved = { imageUrls: [], videoUrl: '', videoUpload: null, uploads: [] };
  if (hasMedia) {
    resolved = await resolveInnovationUploads({
      actor: req.user,
      sessionId: uploadSessionId,
      imageUploadIds,
      videoUploadId,
    });
  }

  const quota = await assertCreateQuota(res, req.user._id);
  if (quota) return quota;

  // isVisible is forced server-side — a client-supplied value is ignored.
  const idea = await InnovationIdea.create({
    title: typeof title === 'string' ? title.trim() : title,
    category,
    description: typeof description === 'string' ? description.trim() : description,
    images: resolved.imageUrls,
    videoUrl: resolved.videoUrl || null,
    videoThumbnail: resolved.videoUrl ? videoThumbnailFor(resolved.videoUpload, resolved.videoUrl) : null,
    submittedBy: req.user._id,
    isVisible: true,
  });

  if (resolved.uploads.length > 0) {
    // Commit AFTER create (the entity must exist first). On commit failure
    // the just-created idea is removed again so no half-attached record
    // survives — Cloudinary itself stays outside any transaction, the
    // sweeper covers that boundary (property-create convention).
    try {
      await commitUploads({
        actor: req.user,
        sessionId: uploadSessionId,
        uploadIds: resolved.uploads.map((u) => String(u._id)),
        entityType: 'innovation',
        entityId: String(idea._id),
      });
    } catch (err) {
      await InnovationIdea.deleteOne({ _id: idea._id });
      throw err;
    }
    await closeSession(uploadSessionId, req.user);
  }

  await idea.populate('submittedBy', SUBMITTER_POPULATE);
  res.status(201).json({ success: true, message: 'Innovation submitted successfully', innovation: idea });
});

// Shared list helper: filter + newest-first + pagination + safe populate.
const listInnovations = async (res, query, { page = 1, limit = 12, populate = SUBMITTER_POPULATE } = {}) => {
  const { pageNum, limitNum, skip } = parsePagination({ page, limit });
  const [total, innovations] = await Promise.all([
    InnovationIdea.countDocuments(query),
    InnovationIdea.find(query)
      .populate('submittedBy', populate)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
  ]);
  return res.json({
    success: true,
    count: innovations.length,
    pagination: paginationOf(total, pageNum, limitNum),
    innovations,
  });
};

// @desc    Public feed of visible ideas
// @route   GET /api/innovations/public
// @access  Public
const getPublicInnovations = asyncHandler(async (req, res) => {
  const { q, page, limit } = req.query;
  return listInnovations(
    res,
    { isVisible: true, ...searchFilter(q) },
    { page, limit, populate: SUBMITTER_PUBLIC_POPULATE }
  );
});

// @desc    Current user's own ideas (visible + hidden)
// @route   GET /api/innovations/mine
// @access  Private (any authenticated user)
const getMyInnovations = asyncHandler(async (req, res) => {
  const { q, page, limit } = req.query;
  return listInnovations(
    res,
    { submittedBy: req.user._id, ...searchFilter(q) },
    { page, limit, populate: SUBMITTER_PUBLIC_POPULATE }
  );
});

// @desc    Admin: all ideas with visibility filter
// @route   GET /api/innovations/admin
// @access  Private (admin)
const getAdminInnovations = asyncHandler(async (req, res) => {
  const { q, visibility = 'all', page, limit } = req.query;
  const query = { ...searchFilter(q) };
  if (visibility === 'visible') query.isVisible = true;
  else if (visibility === 'hidden') query.isVisible = false;
  else if (visibility !== 'all') {
    return res.status(400).json({ success: false, message: 'visibility must be all, visible or hidden' });
  }
  return listInnovations(res, query, { page, limit });
});

// @desc    Edit own idea (admin: any idea). Media via keep-list + new uploads.
// @route   PUT /api/innovations/:id
// @access  Private (owner or admin; agents blocked at the route)
const updateInnovation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ success: false, message: 'Innovation not found' });
  }
  const idea = await InnovationIdea.findById(id);
  if (!idea) return res.status(404).json({ success: false, message: 'Innovation not found' });
  if (!isOwnerOrAdmin(idea, req.user)) {
    return res.status(403).json({ success: false, message: 'Not authorized to edit this idea' });
  }

  const {
    title,
    category,
    description,
    uploadSessionId,
    imageUploadIds,
    videoUploadId,
    keepImageUrls,
    keepVideoUrl,
    removeVideo,
  } = req.body || {};

  if (Array.isArray(videoUploadId)) {
    return res.status(400).json({ success: false, message: 'Only one video is allowed per idea' });
  }

  // Resolve newly uploaded media first (validates before touching the doc).
  const wantsNewMedia =
    (Array.isArray(imageUploadIds) && imageUploadIds.length > 0) || videoUploadId !== undefined;
  let resolved = { imageUrls: [], videoUrl: '', videoUpload: null, uploads: [] };
  if (wantsNewMedia) {
    resolved = await resolveInnovationUploads({
      actor: req.user,
      sessionId: uploadSessionId,
      imageUploadIds,
      videoUploadId,
      forEntityId: String(idea._id),
    });
  }

  // Images: keep-list intersected with the doc (foreign URLs can't be
  // injected) + newly resolved, capped at 5. Absent keep-list keeps all.
  const currentImages = idea.images || [];
  const keptImages = Array.isArray(keepImageUrls)
    ? keepImageUrls.filter((url) => currentImages.includes(url))
    : [...currentImages];
  const finalImages = [...keptImages, ...resolved.imageUrls];
  if (finalImages.length > 5) {
    return res.status(400).json({ success: false, message: 'An idea holds at most 5 images' });
  }

  // Video: replace > remove > explicit keep > untouched default.
  let finalVideoUrl = idea.videoUrl || null;
  let finalThumbnail = idea.videoThumbnail || null;
  let videoChanged = false;
  if (videoUploadId !== undefined) {
    finalVideoUrl = resolved.videoUrl || null;
    finalThumbnail = resolved.videoUrl
      ? videoThumbnailFor(resolved.videoUpload, resolved.videoUrl)
      : null;
    videoChanged = true;
  } else if (removeVideo === true) {
    finalVideoUrl = null;
    finalThumbnail = null;
    videoChanged = true;
  } else if (keepVideoUrl !== undefined) {
    if (keepVideoUrl && keepVideoUrl !== idea.videoUrl) {
      return res.status(400).json({ success: false, message: 'keepVideoUrl does not match the current video' });
    }
    if (!keepVideoUrl) {
      finalVideoUrl = null;
      finalThumbnail = null;
      videoChanged = true;
    }
  }

  // Text fields: only whitelisted keys; submittedBy/isVisible are never
  // client-settable here (visibility has its own admin endpoint).
  if (title !== undefined) idea.title = typeof title === 'string' ? title.trim() : title;
  if (category !== undefined) idea.category = category;
  if (description !== undefined) idea.description = typeof description === 'string' ? description.trim() : description;
  idea.images = finalImages;
  if (videoChanged) {
    idea.videoUrl = finalVideoUrl;
    idea.videoThumbnail = finalThumbnail;
  }
  await idea.save();

  if (resolved.uploads.length > 0) {
    // Uploads stay `completed` on save failure above, so the client can
    // retry with the same ids — no re-upload needed.
    await commitUploads({
      actor: req.user,
      sessionId: uploadSessionId,
      uploadIds: resolved.uploads.map((u) => String(u._id)),
      entityType: 'innovation',
      entityId: String(idea._id),
    });
    await closeSession(uploadSessionId, req.user);
  }
  // Retire anything the keep-list dropped (best-effort, never throws).
  await retireRemovedEntityUploads({
    entityType: 'innovation',
    entityId: idea._id,
    keepUrls: [...(idea.images || []), idea.videoUrl].filter(Boolean),
  });

  await idea.populate('submittedBy', SUBMITTER_POPULATE);
  res.json({ success: true, message: 'Innovation updated successfully', innovation: idea });
});

// Destroys every Cloudinary asset referenced by an idea document. Bytes
// first (best-effort, never throws), Upload-row bookkeeping follows via
// releaseEntityUploads (hero-delete convention — not the property-delete
// path, which leaves Upload rows orphaned).
const destroyIdeaMedia = async (idea) => {
  for (const url of idea.images || []) {
    // eslint-disable-next-line no-await-in-loop
    await destroyByPublicId(publicIdFromUrl(url), 'image');
  }
  if (idea.videoUrl) {
    await destroyByPublicId(publicIdFromUrl(idea.videoUrl), 'video');
  }
};

// @desc    Delete own idea (admin: any idea) + its media
// @route   DELETE /api/innovations/:id
// @access  Private (owner or admin)
const deleteInnovation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ success: false, message: 'Innovation not found' });
  }
  const idea = await InnovationIdea.findById(id);
  if (!idea) return res.status(404).json({ success: false, message: 'Innovation not found' });
  if (!isOwnerOrAdmin(idea, req.user)) {
    return res.status(403).json({ success: false, message: 'Not authorized to delete this idea' });
  }
  await destroyIdeaMedia(idea);
  await idea.deleteOne();
  await releaseEntityUploads({ entityType: 'innovation', entityId: idea._id });
  res.json({ success: true, message: 'Innovation deleted successfully' });
});

// @desc    Admin: hide or show an idea (no approval workflow in V1)
// @route   PATCH /api/innovations/:id/visibility
// @access  Private (admin)
const toggleVisibility = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ success: false, message: 'Innovation not found' });
  }
  const idea = await InnovationIdea.findById(id).populate('submittedBy', SUBMITTER_POPULATE);
  if (!idea) return res.status(404).json({ success: false, message: 'Innovation not found' });
  if (typeof req.body?.isVisible !== 'boolean') {
    return res.status(400).json({ success: false, message: 'isVisible must be true or false' });
  }
  idea.isVisible = req.body.isVisible;
  await idea.save();
  res.json({
    success: true,
    message: idea.isVisible ? 'Innovation is now visible' : 'Innovation is now hidden',
    innovation: idea,
  });
});

module.exports = {
  createInnovation,
  getPublicInnovations,
  getMyInnovations,
  updateInnovation,
  deleteInnovation,
  getAdminInnovations,
  toggleVisibility,
};
