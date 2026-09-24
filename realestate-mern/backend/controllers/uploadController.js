const uploadService = require('../services/uploadService');
const { recordUploadError, getMetrics } = require('../utils/uploadMetrics');

// Thin HTTP layer — all policy lives in services/uploadService.js.
// Response envelopes follow the repo convention: { success, ... }.

const sessionDto = (s) => ({
  sessionId: String(s._id),
  scope: s.scope,
  status: s.status,
  expiresAt: s.expiresAt,
});

const uploadDto = (u) => ({
  uploadId: String(u._id),
  sessionId: String(u.sessionId),
  purpose: u.purpose,
  publicId: u.publicId,
  resourceType: u.resourceType,
  deliveryType: u.deliveryType,
  status: u.status,
  expiresAt: u.expiresAt,
  committedTo: u.committedTo || undefined,
});

// POST /api/uploads/session { scope, ref? }
const createSession = async (req, res, next) => {
  try {
    const session = await uploadService.createSession({
      user: req.user,
      scope: req.body.scope,
      ref: req.body.ref,
    });
    res.status(201).json({ success: true, session: sessionDto(session) });
  } catch (err) {
    next(err);
  }
};

// POST /api/uploads/sign { sessionId, purpose, mediaKind?, docType?, planId?, installmentNo? }
const sign = async (req, res, next) => {
  try {
    const { sessionId, purpose, mediaKind, docType, planId, installmentNo } = req.body;
    const signed = await uploadService.signUpload({
      user: req.user,
      sessionId,
      purpose,
      refs: { mediaKind, docType, planId, installmentNo },
    });
    res.status(201).json({ success: true, upload: signed });
  } catch (err) {
    if (err.statusCode === 429) recordUploadError('signRateLimited');
    if (err.statusCode === 429 && err.retryAfterSec) {
      res.set('Retry-After', String(err.retryAfterSec));
    }
    next(err);
  }
};

// POST /api/uploads/:id/complete { bytes?, format?, resourceType?, width?, height?, duration? }
const complete = async (req, res, next) => {
  try {
    const upload = await uploadService.completeUpload({
      user: req.user,
      uploadId: req.params.id,
      meta: req.body || {},
    });
    res.status(200).json({ success: true, upload: uploadDto(upload) });
  } catch (err) {
    if (err.statusCode === 422) recordUploadError('completeRejected');
    next(err);
  }
};

// POST /api/uploads/commit { sessionId, uploadIds, entityType, entityId?, closeSession? }
const commit = async (req, res, next) => {
  try {
    const uploads = await uploadService.commitUploads({
      actor: req.user,
      sessionId: req.body.sessionId,
      uploadIds: req.body.uploadIds,
      entityType: req.body.entityType,
      entityId: req.body.entityId,
    });
    if (req.body.closeSession) {
      const UploadSession = require('../models/UploadSession');
      const session = await UploadSession.findById(req.body.sessionId);
      if (session && String(session.userId) === String(req.user._id)) {
        session.status = 'closed';
        await session.save();
      }
    }
    res.status(200).json({ success: true, uploads: uploads.map(uploadDto) });
  } catch (err) {
    if (err.statusCode === 409) recordUploadError('commitConflict');
    if (err.statusCode === 404) recordUploadError('commitNotFound');
    if (err.statusCode >= 500 || !err.statusCode) recordUploadError('commitFailed');
    next(err);
  }
};

// DELETE /api/uploads/:id
const remove = async (req, res, next) => {
  try {
    const upload = await uploadService.requestDelete({ actor: req.user, uploadId: req.params.id });
    res.status(200).json({ success: true, upload: uploadDto(upload) });
  } catch (err) {
    if (err.statusCode === 409) recordUploadError('deleteConflict');
    next(err);
  }
};

// GET /api/uploads/view/:id
const view = async (req, res, next) => {
  try {
    const result = await uploadService.buildView({ viewer: req.user, uploadId: req.params.id });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// GET /api/uploads/metrics (admin) — Phase 2 old-vs-new aggregates.
const metrics = async (req, res) => {
  res.status(200).json({ success: true, metrics: getMetrics() });
};

module.exports = { createSession, sign, complete, commit, remove, view, metrics };
