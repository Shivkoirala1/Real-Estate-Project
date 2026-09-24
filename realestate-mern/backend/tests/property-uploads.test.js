// Phase 2 — property cover + gallery direct-upload migration tests.
// Run: node --test tests/property-uploads.test.js
// Cloudinary is never touched (signing is local HMAC, destroy stubbed).
// Covers: create with cover+gallery, minimum-image rule + resubmit reuse,
// management without cover, update (preserve/remove/replace + retire),
// cross-user + wrong-purpose + incomplete rejections, flag-off, metrics.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'property-uploads-test-secret';
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'test-cloud';
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || 'test-key';
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const { resetSignLimits } = require('../middleware/uploadRateLimit');
const cloudinaryUtil = require('../utils/cloudinary');
const User = require('../models/User');
const Upload = require('../models/Upload');
const { PropertyType } = require('../models/Category');
const propertyRoutes = require('../routes/propertyRoutes');
const uploadRoutes = require('../routes/uploadRoutes');

describe('Phase 2 property direct upload', () => {
  let mongod;
  let api;
  let admin;
  let agent;
  let stranger;
  let houseType;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });

  const basePayload = (overrides = {}) => ({
    title: 'Spacious family house for sale near the ring road',
    description: 'A wonderful family home near the main road with a garden and parking space.',
    propertyType: String(houseType._id),
    saleType: 'sale',
    price: 15000000,
    currency: 'NPR',
    negotiable: true,
    location: { province: 'Bagmati Province', district: 'Kathmandu', municipality: 'Kathmandu' },
    details: { landArea: 5, builtUpArea: 2000, bedrooms: 3, bathrooms: 2, floors: 2 },
    video: '',
    ...overrides,
  });

  // Full sign → complete cycle over HTTP (own session per call).
  // Returns { uploadId, publicId, sessionId }.
  const readyUpload = async (user, scope, purpose, extra = {}, meta = { bytes: 50000, format: 'jpg', resourceType: 'image' }) => {
    const s = await request(api).post('/api/uploads/session').set(auth(user)).send({ scope });
    assert.equal(s.status, 201);
    const g = await request(api).post('/api/uploads/sign').set(auth(user)).send({
      sessionId: s.body.session.sessionId, purpose, ...extra,
    });
    assert.equal(g.status, 201);
    const c = await request(api).post(`/api/uploads/${g.body.upload.uploadId}/complete`).set(auth(user)).send(meta);
    assert.equal(c.status, 200);
    return { uploadId: g.body.upload.uploadId, publicId: `${g.body.upload.folder}/${g.body.upload.publicId}`, sessionId: s.body.session.sessionId };
  };

  // Sign + complete a cover and N gallery images inside ONE session.
  const readySet = async (user, galleryCount = 1) => {
    const s = await request(api).post('/api/uploads/session').set(auth(user)).send({ scope: 'property' });
    assert.equal(s.status, 201);
    const sessionId = s.body.session.sessionId;
    const one = async (purpose, meta = { bytes: 50000, format: 'jpg', resourceType: 'image' }) => {
      const g = await request(api).post('/api/uploads/sign').set(auth(user)).send({ sessionId, purpose });
      assert.equal(g.status, 201);
      const c = await request(api).post(`/api/uploads/${g.body.upload.uploadId}/complete`).set(auth(user)).send(meta);
      assert.equal(c.status, 200);
      return { uploadId: g.body.upload.uploadId, publicId: `${g.body.upload.folder}/${g.body.upload.publicId}` };
    };
    const cover = await one('property-cover');
    const gallery = [];
    for (let i = 0; i < galleryCount; i++) {
      // eslint-disable-next-line no-await-in-loop
      gallery.push(await one('property-image'));
    }
    return { sessionId, cover, gallery };
  };

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    cloudinaryUtil.cloudinary.uploader.destroy = async () => ({ result: 'ok' });

    const app = express();
    app.use(express.json());
    app.use('/api/properties', propertyRoutes);
    app.use('/api/uploads', uploadRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, agent, stranger] = await Promise.all([
      User.create({ name: 'Admin', email: 'pu-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'Agent', email: 'pu-agent@test.com', password: 'password1', role: 'agent', verificationStatus: 'verified' }),
      User.create({ name: 'Stranger', email: 'pu-stranger@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
    ]);
    houseType = await PropertyType.create({ name: 'Phase2 Test House', category: 'building' });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => {
    resetSignLimits();
  });

  it('creates a property with direct cover + gallery and commits uploads', async () => {
    // All three uploads share ONE session — commit requires it.
    const sess = await request(api).post('/api/uploads/session').set(auth(agent)).send({ scope: 'property' });
    const sessionId = sess.body.session.sessionId;
    const signComplete = async (purpose, meta = { bytes: 50000, format: 'jpg', resourceType: 'image' }) => {
      const g = await request(api).post('/api/uploads/sign').set(auth(agent)).send({ sessionId, purpose });
      assert.equal(g.status, 201);
      const c = await request(api).post(`/api/uploads/${g.body.upload.uploadId}/complete`).set(auth(agent)).send(meta);
      assert.equal(c.status, 200);
      return { uploadId: g.body.upload.uploadId, publicId: `${g.body.upload.folder}/${g.body.upload.publicId}` };
    };
    const cover = await signComplete('property-cover');
    const g1 = await signComplete('property-image');
    const g2 = await signComplete('property-image', { bytes: 60000, format: 'png', resourceType: 'image' });

    const res = await request(api).post('/api/properties').set(auth(agent)).send(basePayload({
      uploadSessionId: sessionId,
      coverUploadId: cover.uploadId,
      galleryUploadIds: [g1.uploadId, g2.uploadId],
    }));
    assert.equal(res.status, 201);
    assert.ok(res.body.property.media.coverImage.includes(cover.publicId));
    assert.equal(res.body.property.media.images.length, 2);

    const rows = await Upload.find({ sessionId }).sort({ _id: 1 });
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.equal(row.status, 'committed');
      assert.equal(String(row.committedTo.entityId), String(res.body.property._id));
    }
  });

  it('rejects imageless listings but keeps uploads completed for resubmit', async () => {
    const g1 = await readyUpload(agent, 'property', 'property-image');
    const bare = await request(api).post('/api/properties').set(auth(agent)).send(basePayload());
    assert.equal(bare.status, 400);
    assert.match(bare.body.message, /cover image/i);

    // The completed upload was never referenced — still completed.
    const row = await Upload.findById(g1.uploadId);
    assert.equal(row.status, 'completed');

    // Resubmit reusing the same gallery id (cover falls back to images[0],
    // mirroring the legacy rule) — no re-upload needed.
    const retry = await request(api).post('/api/properties').set(auth(agent)).send(basePayload({
      uploadSessionId: g1.sessionId,
      galleryUploadIds: [g1.uploadId],
    }));
    assert.equal(retry.status, 201);
    assert.ok(retry.body.property.media.coverImage.includes(g1.publicId));
  });

  it('allows management-purpose listings without a cover', async () => {
    const res = await request(api).post('/api/properties').set(auth(agent)).send(basePayload({
      saleType: 'management', price: '',
    }));
    assert.equal(res.status, 201);
    assert.equal(res.body.property.media.coverImage, '');
  });

  it('updates: preserves kept images, appends new ones, replaces cover and retires the old', async () => {
    const first = await readySet(agent, 1);
    const created = await request(api).post('/api/properties').set(auth(agent)).send(basePayload({
      uploadSessionId: first.sessionId,
      coverUploadId: first.cover.uploadId,
      galleryUploadIds: first.gallery.map((g) => g.uploadId),
    }));
    assert.equal(created.status, 201);
    const propId = created.body.property._id;
    const oldCoverPublicId = first.cover.publicId;
    const keptGalleryUrl = created.body.property.media.images[0];

    const next = await readySet(agent, 1);
    const updated = await request(api).put(`/api/properties/${propId}`).set(auth(agent)).send({
      ...basePayload(),
      existingImages: [keptGalleryUrl],
      uploadSessionId: next.sessionId,
      coverUploadId: next.cover.uploadId,
      galleryUploadIds: next.gallery.map((g) => g.uploadId),
    });
    assert.equal(updated.status, 200);
    assert.ok(updated.body.property.media.coverImage.includes(next.cover.publicId));
    assert.equal(updated.body.property.media.images.length, 2);
    assert.ok(updated.body.property.media.images.includes(keptGalleryUrl));

    // Old cover retired: deleted + destroy succeeded via stub.
    const oldCover = await Upload.findOne({ publicId: oldCoverPublicId });
    assert.equal(oldCover.status, 'deleted');
    assert.equal(oldCover.destroyQueued, false);
    // Kept gallery still committed.
    const kept = await Upload.findOne({ publicId: first.gallery[0].publicId });
    assert.equal(kept.status, 'committed');
  });

  it('updates: removing an existing image retires its upload record', async () => {
    const first = await readySet(agent, 1);
    const created = await request(api).post('/api/properties').set(auth(agent)).send(basePayload({
      uploadSessionId: first.sessionId,
      coverUploadId: first.cover.uploadId,
      galleryUploadIds: first.gallery.map((g) => g.uploadId),
    }));
    const propId = created.body.property._id;

    const updated = await request(api).put(`/api/properties/${propId}`).set(auth(agent)).send({
      ...basePayload(),
      existingImages: [],
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body.property.media.images, []);
    const retired = await Upload.findOne({ publicId: first.gallery[0].publicId });
    assert.equal(retired.status, 'deleted');
  });

  it('rejects another user uploads (403) and wrong-purpose uploads (422)', async () => {
    const victim = await readyUpload(agent, 'property', 'property-image');
    const thiefSession = await request(api).post('/api/uploads/session').set(auth(stranger)).send({ scope: 'property' });
    const stolen = await request(api).post('/api/properties').set(auth(stranger)).send(basePayload({
      uploadSessionId: thiefSession.body.session.sessionId,
      galleryUploadIds: [victim.uploadId],
    }));
    assert.equal(stolen.status, 403);

    const avatar = await readyUpload(stranger, 'avatar', 'avatar', {}, { bytes: 10000, format: 'png' });
    const ownSession = await request(api).post('/api/uploads/session').set(auth(stranger)).send({ scope: 'property' });
    const wrong = await request(api).post('/api/properties').set(auth(stranger)).send(basePayload({
      uploadSessionId: ownSession.body.session.sessionId,
      galleryUploadIds: [avatar.uploadId],
    }));
    assert.ok([403, 422].includes(wrong.status), `got ${wrong.status}`);
  });

  it('rejects incomplete (pending) uploads (409)', async () => {
    const s = await request(api).post('/api/uploads/session').set(auth(agent)).send({ scope: 'property' });
    const g = await request(api).post('/api/uploads/sign').set(auth(agent)).send({
      sessionId: s.body.session.sessionId, purpose: 'property-image',
    });
    const res = await request(api).post('/api/properties').set(auth(agent)).send(basePayload({
      uploadSessionId: s.body.session.sessionId,
      galleryUploadIds: [g.body.upload.uploadId],
    }));
    assert.equal(res.status, 409);
  });

  it('rejects direct uploadIds when the flag is off (400)', async () => {
    process.env.PROPERTY_DIRECT_UPLOAD_ENABLED = 'false';
    try {
      const res = await request(api).post('/api/properties').set(auth(agent)).send(basePayload({
        uploadSessionId: String(new mongoose.Types.ObjectId()),
        galleryUploadIds: [String(new mongoose.Types.ObjectId())],
      }));
      assert.equal(res.status, 400);
      assert.match(res.body.message, /disabled/i);
    } finally {
      delete process.env.PROPERTY_DIRECT_UPLOAD_ENABLED;
    }
  });

  it('validation failure does not consume uploads — same ids succeed on resubmit', async () => {
    const cover = await readyUpload(agent, 'property', 'property-cover');
    const bad = await request(api).post('/api/properties').set(auth(agent)).send(basePayload({
      title: 'x',
      uploadSessionId: cover.sessionId,
      coverUploadId: cover.uploadId,
    }));
    assert.equal(bad.status, 400);
    const row = await Upload.findById(cover.uploadId);
    assert.equal(row.status, 'completed');

    const good = await request(api).post('/api/properties').set(auth(agent)).send(basePayload({
      uploadSessionId: cover.sessionId,
      coverUploadId: cover.uploadId,
    }));
    assert.equal(good.status, 201);
  });

  it('metrics endpoint exposes direct-submit aggregates to admins only', async () => {
    const adminView = await request(api).get('/api/uploads/metrics').set(auth(admin));
    assert.equal(adminView.status, 200);
    assert.ok(adminView.body.metrics.propertySubmit.direct.count >= 1);
    const denied = await request(api).get('/api/uploads/metrics').set(auth(agent));
    assert.equal(denied.status, 403);
  });
});
