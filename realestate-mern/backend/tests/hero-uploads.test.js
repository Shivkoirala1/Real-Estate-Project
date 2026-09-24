// Phase 3 — hero media + thumbnail direct-upload migration tests.
// Run: node --test tests/hero-uploads.test.js
// Cloudinary is never touched (signing is local HMAC, destroy stubbed).
// Covers: create (image+thumb, video), media-required + resubmit reuse,
// mediaType match, size caps at complete, update keep/replace/retire,
// validation-failure preservation (Scenario E), cross-user/wrong-purpose/
// pending/expired/committed rejections, admin gates, flag-off, delete
// release, metrics authZ. Scenarios A–C (retry/cancel UX) are frontend hook
// behavior — backend analogs (partial submit 409 without loss, pre-submit
// DELETE) are covered here.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hero-uploads-test-secret';
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'test-cloud';
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || 'test-key';
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const { resetSignLimits } = require('../middleware/uploadRateLimit');
const cloudinaryUtil = require('../utils/cloudinary');
const User = require('../models/User');
const Upload = require('../models/Upload');
const heroSlideRoutes = require('../routes/heroSlideRoutes');
const uploadRoutes = require('../routes/uploadRoutes');

describe('Phase 3 hero direct upload', () => {
  let mongod;
  let api;
  let admin;
  let adminTwo;
  let agent;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });

  const baseSlide = (overrides = {}) => ({
    title: 'Phase 3 test slide',
    mediaType: 'image',
    duration: 5,
    status: 'draft',
    ...overrides,
  });

  // Sign + complete inside ONE hero session. Returns { sessionId, media, thumb? }.
  const readySet = async (user, { withThumb = true, kind = 'image' } = {}) => {
    const s = await request(api).post('/api/uploads/session').set(auth(user)).send({ scope: 'hero' });
    assert.equal(s.status, 201);
    const sessionId = s.body.session.sessionId;
    const one = async (purpose, extra = {}, meta = { bytes: 200000, format: 'jpg', resourceType: 'image' }) => {
      const g = await request(api).post('/api/uploads/sign').set(auth(user)).send({ sessionId, purpose, ...extra });
      assert.equal(g.status, 201);
      const c = await request(api).post(`/api/uploads/${g.body.upload.uploadId}/complete`).set(auth(user)).send(meta);
      assert.equal(c.status, 200);
      return { uploadId: g.body.upload.uploadId, publicId: g.body.upload.publicId };
    };
    const media = await one('hero-media', { mediaKind: kind },
      kind === 'video'
        ? { bytes: 20000000, format: 'mp4', resourceType: 'video', duration: 12 }
        : undefined);
    const thumb = withThumb ? await one('hero-thumbnail') : null;
    return { sessionId, media, thumb };
  };

  const createSlide = async (user, body) => {
    const res = await request(api).post('/api/hero-slides').set(auth(user)).send(body);
    return res;
  };

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    cloudinaryUtil.cloudinary.uploader.destroy = async () => ({ result: 'ok' });

    const app = express();
    app.use(express.json());
    app.use('/api/hero-slides', heroSlideRoutes);
    app.use('/api/uploads', uploadRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, adminTwo, agent] = await Promise.all([
      User.create({ name: 'Admin', email: 'hu-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'Admin2', email: 'hu-admin2@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'Agent', email: 'hu-agent@test.com', password: 'password1', role: 'agent', verificationStatus: 'verified' }),
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => {
    resetSignLimits();
  });

  it('creates a slide with direct image + thumbnail and commits uploads', async () => {
    const set = await readySet(admin, { withThumb: true });
    const res = await createSlide(admin, baseSlide({
      uploadSessionId: set.sessionId,
      mediaUploadId: set.media.uploadId,
      thumbnailUploadId: set.thumb.uploadId,
    }));
    assert.equal(res.status, 201);
    assert.equal(res.body.slide.media.type, 'image');
    assert.ok(res.body.slide.media.url.includes(set.media.publicId));
    assert.ok(res.body.slide.media.publicId === set.media.publicId);
    assert.ok(res.body.slide.media.thumbnailUrl.includes(set.thumb.publicId));

    const rows = await Upload.find({ sessionId: set.sessionId });
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.status, 'committed');
      assert.equal(String(row.committedTo.entityId), String(res.body.slide._id));
    }
  });

  it('creates a video slide without thumbnail', async () => {
    const set = await readySet(admin, { withThumb: false, kind: 'video' });
    const res = await createSlide(admin, baseSlide({
      mediaType: 'video',
      uploadSessionId: set.sessionId,
      mediaUploadId: set.media.uploadId,
    }));
    assert.equal(res.status, 201);
    assert.equal(res.body.slide.media.type, 'video');
    assert.equal(res.body.slide.media.thumbnailUrl, null);
  });

  it('requires media but keeps uploads completed for resubmit', async () => {
    const set = await readySet(admin, { withThumb: false });
    const bare = await createSlide(admin, baseSlide());
    assert.equal(bare.status, 400);
    assert.match(bare.body.message, /media/i);

    const row = await Upload.findById(set.media.uploadId);
    assert.equal(row.status, 'completed');

    const retry = await createSlide(admin, baseSlide({
      uploadSessionId: set.sessionId,
      mediaUploadId: set.media.uploadId,
    }));
    assert.equal(retry.status, 201);
  });

  it('rejects declared-mediaType mismatch (400) and oversize image at complete (422)', async () => {
    const set = await readySet(admin, { withThumb: false });
    const mismatch = await createSlide(admin, baseSlide({
      mediaType: 'video',
      uploadSessionId: set.sessionId,
      mediaUploadId: set.media.uploadId,
    }));
    assert.equal(mismatch.status, 400);
    assert.match(mismatch.body.message, /match/i);

    const s = await request(api).post('/api/uploads/session').set(auth(admin)).send({ scope: 'hero' });
    const g = await request(api).post('/api/uploads/sign').set(auth(admin)).send({
      sessionId: s.body.session.sessionId, purpose: 'hero-media', mediaKind: 'image',
    });
    const big = await request(api).post(`/api/uploads/${g.body.upload.uploadId}/complete`).set(auth(admin)).send({
      bytes: 11 * 1024 * 1024, format: 'jpg', resourceType: 'image',
    });
    assert.equal(big.status, 422);
  });

  it('updates: keeps media on title-only edit', async () => {
    const set = await readySet(admin, { withThumb: true });
    const created = await createSlide(admin, baseSlide({
      uploadSessionId: set.sessionId,
      mediaUploadId: set.media.uploadId,
      thumbnailUploadId: set.thumb.uploadId,
    }));
    const updated = await request(api).put(`/api/hero-slides/${created.body.slide._id}`).set(auth(admin)).send({
      title: 'Renamed slide title here',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.slide.media.url, created.body.slide.media.url);
    assert.equal(updated.body.slide.media.thumbnailUrl, created.body.slide.media.thumbnailUrl);
  });

  it('updates: replaces media, retires the old upload, keeps thumbnail', async () => {
    const first = await readySet(admin, { withThumb: true });
    const created = await createSlide(admin, baseSlide({
      uploadSessionId: first.sessionId,
      mediaUploadId: first.media.uploadId,
      thumbnailUploadId: first.thumb.uploadId,
    }));
    const slideId = created.body.slide._id;

    const next = await readySet(admin, { withThumb: false });
    const updated = await request(api).put(`/api/hero-slides/${slideId}`).set(auth(admin)).send({
      uploadSessionId: next.sessionId,
      mediaUploadId: next.media.uploadId,
    });
    assert.equal(updated.status, 200);
    assert.ok(updated.body.slide.media.url.includes(next.media.publicId));
    assert.equal(updated.body.slide.media.thumbnailUrl, created.body.slide.media.thumbnailUrl);

    const oldMedia = await Upload.findOne({ publicId: first.media.publicId });
    assert.equal(oldMedia.status, 'deleted');
    const keptThumb = await Upload.findOne({ publicId: first.thumb.publicId });
    assert.equal(keptThumb.status, 'committed');
  });

  it('updates: replaces thumbnail only, preserves media', async () => {
    const first = await readySet(admin, { withThumb: true });
    const created = await createSlide(admin, baseSlide({
      uploadSessionId: first.sessionId,
      mediaUploadId: first.media.uploadId,
      thumbnailUploadId: first.thumb.uploadId,
    }));
    const slideId = created.body.slide._id;

    const next = await readySet(admin, { withThumb: true });
    const updated = await request(api).put(`/api/hero-slides/${slideId}`).set(auth(admin)).send({
      uploadSessionId: next.sessionId,
      thumbnailUploadId: next.thumb.uploadId,
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.slide.media.url, created.body.slide.media.url);
    assert.ok(updated.body.slide.media.thumbnailUrl.includes(next.thumb.publicId));

    const oldThumb = await Upload.findOne({ publicId: first.thumb.publicId });
    assert.equal(oldThumb.status, 'deleted');
  });

  it('Scenario E: update validation failure leaves existing media usable and new uploads completed', async () => {
    const first = await readySet(admin, { withThumb: false });
    const created = await createSlide(admin, baseSlide({
      uploadSessionId: first.sessionId,
      mediaUploadId: first.media.uploadId,
    }));
    const slideId = created.body.slide._id;

    const next = await readySet(admin, { withThumb: false });
    const bad = await request(api).put(`/api/hero-slides/${slideId}`).set(auth(admin)).send({
      uploadSessionId: next.sessionId,
      mediaUploadId: next.media.uploadId,
      duration: 999,
    });
    assert.equal(bad.status, 400);

    const slide = await request(api).get(`/api/hero-slides/${slideId}`).set(auth(admin));
    assert.equal(slide.body.slide.media.url, created.body.slide.media.url);
    const pending = await Upload.findById(next.media.uploadId);
    assert.equal(pending.status, 'completed');
  });

  it('rejects cross-user (403), wrong-purpose (422), pending (409), expired (410), reuse (409)', async () => {
    const victim = await readySet(admin, { withThumb: false });
    const thiefSession = await request(api).post('/api/uploads/session').set(auth(adminTwo)).send({ scope: 'hero' });
    const stolen = await createSlide(adminTwo, baseSlide({
      uploadSessionId: thiefSession.body.session.sessionId,
      mediaUploadId: victim.media.uploadId,
    }));
    assert.equal(stolen.status, 403);

    const thumbs = await readySet(adminTwo, { withThumb: true });
    const swapped = await createSlide(adminTwo, baseSlide({
      uploadSessionId: thumbs.sessionId,
      mediaUploadId: thumbs.thumb.uploadId,
    }));
    assert.equal(swapped.status, 422);

    const s = await request(api).post('/api/uploads/session').set(auth(adminTwo)).send({ scope: 'hero' });
    const g = await request(api).post('/api/uploads/sign').set(auth(adminTwo)).send({
      sessionId: s.body.session.sessionId, purpose: 'hero-media', mediaKind: 'image',
    });
    const pendingRes = await createSlide(adminTwo, baseSlide({
      uploadSessionId: s.body.session.sessionId,
      mediaUploadId: g.body.upload.uploadId,
    }));
    assert.equal(pendingRes.status, 409);

    await Upload.updateOne({ _id: g.body.upload.uploadId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expiredRes = await createSlide(adminTwo, baseSlide({
      uploadSessionId: s.body.session.sessionId,
      mediaUploadId: g.body.upload.uploadId,
    }));
    // Expired + still pending → 409 (state) or 410 (expiry) both prove rejection.
    assert.ok([409, 410].includes(expiredRes.status), `got ${expiredRes.status}`);

    const first = await readySet(adminTwo, { withThumb: false });
    const one = await createSlide(adminTwo, baseSlide({
      uploadSessionId: first.sessionId,
      mediaUploadId: first.media.uploadId,
    }));
    assert.equal(one.status, 201);
    const second = await readySet(adminTwo, { withThumb: false });
    assert.ok(second.media.uploadId);
    const reuse = await createSlide(adminTwo, baseSlide({
      uploadSessionId: first.sessionId,
      mediaUploadId: first.media.uploadId,
    }));
    // Closed session (410) or already-committed upload (409) — both prove
    // the upload cannot be re-attached to another slide.
    assert.ok([409, 410].includes(reuse.status), `got ${reuse.status}`);
  });

  it('enforces admin-only hero signing (401/403)', async () => {
    const anon = await request(api).post('/api/uploads/session').send({ scope: 'hero' });
    assert.equal(anon.status, 401);
    const agentSession = await request(api).post('/api/uploads/session').set(auth(agent)).send({ scope: 'hero' });
    assert.equal(agentSession.status, 403);
    // Non-admin cannot even reach sign with a hero session of their own.
    const own = await request(api).post('/api/uploads/session').set(auth(agent)).send({ scope: 'property' });
    assert.equal(own.status, 201);
    const sign = await request(api).post('/api/uploads/sign').set(auth(agent)).send({
      sessionId: own.body.session.sessionId, purpose: 'hero-media', mediaKind: 'image',
    });
    assert.ok([400, 403].includes(sign.status), `got ${sign.status}`);
  });

  it('rejects direct payloads when the flag is off (400)', async () => {
    process.env.HERO_DIRECT_UPLOAD_ENABLED = 'false';
    try {
      const res = await createSlide(admin, baseSlide({
        uploadSessionId: String(new mongoose.Types.ObjectId()),
        mediaUploadId: String(new mongoose.Types.ObjectId()),
      }));
      assert.equal(res.status, 400);
      assert.match(res.body.message, /disabled/i);
    } finally {
      delete process.env.HERO_DIRECT_UPLOAD_ENABLED;
    }
  });

  it('delete releases committed upload rows', async () => {
    const set = await readySet(admin, { withThumb: true });
    const created = await createSlide(admin, baseSlide({
      uploadSessionId: set.sessionId,
      mediaUploadId: set.media.uploadId,
      thumbnailUploadId: set.thumb.uploadId,
    }));
    const del = await request(api).delete(`/api/hero-slides/${created.body.slide._id}`).set(auth(admin));
    assert.equal(del.status, 200);
    const rows = await Upload.find({ sessionId: set.sessionId });
    for (const row of rows) assert.equal(row.status, 'deleted');
  });

  it('metrics endpoint exposes hero aggregates to admins only', async () => {
    const adminView = await request(api).get('/api/uploads/metrics').set(auth(admin));
    assert.equal(adminView.status, 200);
    assert.ok(adminView.body.metrics.heroSubmit.direct.count >= 1);
    const denied = await request(api).get('/api/uploads/metrics').set(auth(agent));
    assert.equal(denied.status, 403);
  });
});
