// Phase 1 direct-upload infrastructure — contract tests.
// Run: node --test tests/uploads.test.js
// NOTE: Cloudinary is never touched — signing is local HMAC and
// uploader.destroy is stubbed. Covers sessions, signing policy,
// completion plausibility, commit association, deletion, private delivery,
// rate limits, kill-switch, the upload sweeper, and the Phase 0 blog
// auth-before-upload regression.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'uploads-test-secret';
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'test-cloud';
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || 'test-key';
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const { resetSignLimits } = require('../middleware/uploadRateLimit');
const cloudinaryUtil = require('../utils/cloudinary');
const User = require('../models/User');
const Upload = require('../models/Upload');
const UploadSession = require('../models/UploadSession');
const uploadRoutes = require('../routes/uploadRoutes');
const blogRoutes = require('../routes/blogRoutes');
const { cleanupUploads } = require('../utils/uploadCleanup');

describe('Phase 1 direct-upload infrastructure', () => {
  let mongod;
  let api;
  let admin;
  let verifiedUser;
  let pendingUser;
  let otherUser;
  let rateUser;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });

  const openSession = async (user, scope, ref) => {
    const res = await request(api).post('/api/uploads/session').set(auth(user)).send({ scope, ref });
    assert.equal(res.status, 201);
    return res.body.session.sessionId;
  };

  const sign = async (user, sessionId, body) => {
    const res = await request(api).post('/api/uploads/sign').set(auth(user)).send({ sessionId, ...body });
    return res;
  };

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    // Never hit the network in tests.
    cloudinaryUtil.cloudinary.uploader.destroy = async () => ({ result: 'ok' });

    const app = express();
    app.use(express.json());
    app.use('/api/uploads', uploadRoutes);
    app.use('/api/blogs', blogRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, verifiedUser, pendingUser, otherUser, rateUser] = await Promise.all([
      User.create({ name: 'Admin', email: 'up-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'Verified', email: 'up-verified@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Pending', email: 'up-pending@test.com', password: 'password1', role: 'user' }),
      User.create({ name: 'Other', email: 'up-other@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Rater', email: 'up-rater@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => {
    resetSignLimits();
  });

  it('rejects unauthenticated session creation (401)', async () => {
    const res = await request(api).post('/api/uploads/session').send({ scope: 'property' });
    assert.equal(res.status, 401);
  });

  it('rejects unknown scope (400)', async () => {
    const res = await request(api).post('/api/uploads/session').set(auth(verifiedUser)).send({ scope: 'nope' });
    assert.equal(res.status, 400);
  });

  it('blocks unverified users from property sessions (403)', async () => {
    const res = await request(api).post('/api/uploads/session').set(auth(pendingUser)).send({ scope: 'property' });
    assert.equal(res.status, 403);
  });

  it('blocks non-admin hero sessions (403) and allows admin', async () => {
    const denied = await request(api).post('/api/uploads/session').set(auth(verifiedUser)).send({ scope: 'hero' });
    assert.equal(denied.status, 403);
    const allowed = await request(api).post('/api/uploads/session').set(auth(admin)).send({ scope: 'hero' });
    assert.equal(allowed.status, 201);
    assert.equal(allowed.body.session.scope, 'hero');
  });

  it('signs a property-image with server-derived constraints and no secret', async () => {
    const sessionId = await openSession(verifiedUser, 'property');
    const res = await sign(verifiedUser, sessionId, { purpose: 'property-image' });
    assert.equal(res.status, 201);
    const up = res.body.upload;
    assert.ok(up.uploadId);
    assert.ok(up.signature);
    assert.ok(up.timestamp);
    assert.equal(up.folder, 'youth-real-estate/properties');
    assert.equal(up.resourceType, 'image');
    assert.equal(up.deliveryType, 'public');
    assert.equal(up.maxBytes, 10 * 1024 * 1024);
    assert.ok(!('api_secret' in up) && !('apiSecret' in up));
  });

  it('rejects unknown purpose (400) and cross-scope purpose (400)', async () => {
    const sessionId = await openSession(verifiedUser, 'property');
    const unknown = await sign(verifiedUser, sessionId, { purpose: 'rocket-ship' });
    assert.equal(unknown.status, 400);
    const cross = await sign(verifiedUser, sessionId, { purpose: 'blog-cover' });
    assert.equal(cross.status, 400);
  });

  it('rejects use of another user session (403)', async () => {
    const sessionId = await openSession(verifiedUser, 'property');
    const res = await sign(otherUser, sessionId, { purpose: 'property-image' });
    assert.equal(res.status, 403);
  });

  it('requires mediaKind for hero-media and signs video variant', async () => {
    const sessionId = await openSession(admin, 'hero');
    const missing = await sign(admin, sessionId, { purpose: 'hero-media' });
    assert.equal(missing.status, 400);
    const video = await sign(admin, sessionId, { purpose: 'hero-media', mediaKind: 'video' });
    assert.equal(video.status, 201);
    assert.equal(video.body.upload.resourceType, 'video');
    assert.equal(video.body.upload.folder, 'youth-real-estate/hero-slides/videos');
    assert.equal(video.body.upload.maxBytes, 50 * 1024 * 1024);
  });

  it('signs verification-document as private with docType gate', async () => {
    const sessionId = await openSession(pendingUser, 'verification');
    const bad = await sign(pendingUser, sessionId, { purpose: 'verification-document' });
    assert.equal(bad.status, 400);
    const ok = await sign(pendingUser, sessionId, { purpose: 'verification-document', docType: 'selfie' });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.upload.deliveryType, 'private');
  });

  it('completes with plausible metadata, rejects mismatched type (422) and expired (410)', async () => {
    const sessionId = await openSession(verifiedUser, 'property');
    const s1 = await sign(verifiedUser, sessionId, { purpose: 'property-image' });
    const id = s1.body.upload.uploadId;
    const done = await request(api).post(`/api/uploads/${id}/complete`).set(auth(verifiedUser)).send({ bytes: 123456, format: 'jpg', resourceType: 'image', width: 1200, height: 800 });
    assert.equal(done.status, 200);
    assert.equal(done.body.upload.status, 'completed');

    const s2 = await sign(verifiedUser, sessionId, { purpose: 'property-image' });
    const bad = await request(api).post(`/api/uploads/${s2.body.upload.uploadId}/complete`).set(auth(verifiedUser)).send({ bytes: 100, format: 'jpg', resourceType: 'video' });
    assert.equal(bad.status, 422);

    const s3 = await sign(verifiedUser, sessionId, { purpose: 'property-image' });
    await Upload.updateOne({ _id: s3.body.upload.uploadId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await request(api).post(`/api/uploads/${s3.body.upload.uploadId}/complete`).set(auth(verifiedUser)).send({ bytes: 100, format: 'jpg' });
    assert.equal(expired.status, 410);
  });

  it('commits uploads to a matching entity and rejects mismatched purpose (422)', async () => {
    const sessionId = await openSession(verifiedUser, 'property');
    const s1 = await sign(verifiedUser, sessionId, { purpose: 'property-image' });
    await request(api).post(`/api/uploads/${s1.body.upload.uploadId}/complete`).set(auth(verifiedUser)).send({ bytes: 1000, format: 'png' });
    const entityId = new mongoose.Types.ObjectId();
    const commit = await request(api).post('/api/uploads/commit').set(auth(verifiedUser)).send({
      sessionId, uploadIds: [s1.body.upload.uploadId], entityType: 'property', entityId: String(entityId),
    });
    assert.equal(commit.status, 200);
    assert.equal(commit.body.uploads[0].status, 'committed');

    const aSession = await openSession(verifiedUser, 'avatar');
    const a1 = await sign(verifiedUser, aSession, { purpose: 'avatar' });
    await request(api).post(`/api/uploads/${a1.body.upload.uploadId}/complete`).set(auth(verifiedUser)).send({ bytes: 500, format: 'png' });
    const mismatch = await request(api).post('/api/uploads/commit').set(auth(verifiedUser)).send({
      sessionId: aSession, uploadIds: [a1.body.upload.uploadId], entityType: 'property', entityId: String(entityId),
    });
    assert.equal(mismatch.status, 422);
  });

  it('deletes pending uploads but refuses committed ones (409)', async () => {
    const sessionId = await openSession(verifiedUser, 'property');
    const s1 = await sign(verifiedUser, sessionId, { purpose: 'property-image' });
    const del = await request(api).delete(`/api/uploads/${s1.body.upload.uploadId}`).set(auth(verifiedUser));
    assert.equal(del.status, 200);
    assert.equal(del.body.upload.status, 'deleted');

    const s2 = await sign(verifiedUser, sessionId, { purpose: 'property-image' });
    await request(api).post(`/api/uploads/${s2.body.upload.uploadId}/complete`).set(auth(verifiedUser)).send({ bytes: 100, format: 'jpg' });
    await request(api).post('/api/uploads/commit').set(auth(verifiedUser)).send({
      sessionId, uploadIds: [s2.body.upload.uploadId], entityType: 'property', entityId: String(new mongoose.Types.ObjectId()),
    });
    const refused = await request(api).delete(`/api/uploads/${s2.body.upload.uploadId}`).set(auth(verifiedUser));
    assert.equal(refused.status, 409);
  });

  it('serves an auth-checked view URL for completed uploads', async () => {
    const sessionId = await openSession(verifiedUser, 'property');
    const s1 = await sign(verifiedUser, sessionId, { purpose: 'property-image' });
    await request(api).post(`/api/uploads/${s1.body.upload.uploadId}/complete`).set(auth(verifiedUser)).send({ bytes: 100, format: 'jpg' });
    const view = await request(api).get(`/api/uploads/view/${s1.body.upload.uploadId}`).set(auth(verifiedUser));
    assert.equal(view.status, 200);
    assert.ok(view.body.url.includes('res.cloudinary.com'));
    const stranger = await request(api).get(`/api/uploads/view/${s1.body.upload.uploadId}`).set(auth(otherUser));
    assert.equal(stranger.status, 403);
  });

  it('enforces sign rate limits (429)', async () => {
    process.env.UPLOAD_SIGN_RATE_LIMIT_PER_HOUR = '2';
    try {
      const sessionId = await openSession(rateUser, 'property');
      assert.equal((await sign(rateUser, sessionId, { purpose: 'property-image' })).status, 201);
      assert.equal((await sign(rateUser, sessionId, { purpose: 'property-image' })).status, 201);
      const limited = await sign(rateUser, sessionId, { purpose: 'property-image' });
      assert.equal(limited.status, 429);
    } finally {
      delete process.env.UPLOAD_SIGN_RATE_LIMIT_PER_HOUR;
    }
  });

  it('kill-switch disables new signs with 503', async () => {
    process.env.UPLOAD_DIRECT_ENABLED = 'false';
    try {
      const res = await request(api).post('/api/uploads/session').set(auth(verifiedUser)).send({ scope: 'property' });
      assert.equal(res.status, 503);
    } finally {
      delete process.env.UPLOAD_DIRECT_ENABLED;
    }
  });

  it('sweeper deletes expired uncommitted uploads without throwing', async () => {
    const sessionId = await openSession(verifiedUser, 'property');
    const s1 = await sign(verifiedUser, sessionId, { purpose: 'property-image' });
    await Upload.updateOne({ _id: s1.body.upload.uploadId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const result = await cleanupUploads({ dryRun: false });
    assert.ok(result.affected >= 1);
    const row = await Upload.findById(s1.body.upload.uploadId);
    assert.equal(row.status, 'deleted');
    assert.equal(row.destroyQueued, false);
  });

  it('Phase 0 regression: blog upload requires auth BEFORE touching upload (401)', async () => {
    const res = await request(api).post('/api/blogs').send({ title: 'x' });
    assert.equal(res.status, 401);
    assert.match(res.body.message || '', /token|authorized/i);
  });
});
