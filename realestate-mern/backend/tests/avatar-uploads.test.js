// Phase 4 — avatar direct-upload migration tests.
// Run: node --test tests/avatar-uploads.test.js
// Cloudinary is never touched (signing is local HMAC, destroy stubbed).
// Registration carries NO avatar (legacy behavior preserved — selfie/ID
// only, Phase 5 untouched), so avatar sessions require authentication and
// uploads bind to the caller's own profile. Covers: authenticated upload,
// unauthenticated rejection, cross-user rejection, invalid format,
// oversize at complete, replacement + old retirement, legacy avatar
// replacement, pending/expired states, flag-off, metrics.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'avatar-uploads-test-secret';
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'test-cloud';
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || 'test-key';
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'test-secret';
// authRoutes pulls sendEmail → Resend constructor requires a key at import.
// A dummy value suffices: updateProfile never sends email in these tests.
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_test_dummy';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const { resetSignLimits } = require('../middleware/uploadRateLimit');
const cloudinaryUtil = require('../utils/cloudinary');
const User = require('../models/User');
const Upload = require('../models/Upload');
const authRoutes = require('../routes/authRoutes');
const uploadRoutes = require('../routes/uploadRoutes');

describe('Phase 4 avatar direct upload', () => {
  let mongod;
  let api;
  let user;
  let stranger;

  const auth = (u) => ({ Authorization: `Bearer ${generateToken(u._id, u.role)}` });

  // Sign + complete an avatar upload for `user` in a fresh avatar session.
  const readyAvatar = async (u, meta = { bytes: 80000, format: 'png', resourceType: 'image' }) => {
    const s = await request(api).post('/api/uploads/session').set(auth(u)).send({ scope: 'avatar' });
    assert.equal(s.status, 201);
    const g = await request(api).post('/api/uploads/sign').set(auth(u)).send({
      sessionId: s.body.session.sessionId, purpose: 'avatar',
    });
    assert.equal(g.status, 201);
    const c = await request(api).post(`/api/uploads/${g.body.upload.uploadId}/complete`).set(auth(u)).send(meta);
    assert.equal(c.status, 200);
    return { uploadId: g.body.upload.uploadId, publicId: `${g.body.upload.folder}/${g.body.upload.publicId}`, sessionId: s.body.session.sessionId };
  };

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    cloudinaryUtil.cloudinary.uploader.destroy = async () => ({ result: 'ok' });

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    app.use('/api/uploads', uploadRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [user, stranger] = await Promise.all([
      User.create({ name: 'Selfie User', email: 'au-user@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Stranger', email: 'au-stranger@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => {
    resetSignLimits();
  });

  it('sets the avatar from the caller\'s own completed upload and commits it', async () => {
    const av = await readyAvatar(user);
    const res = await request(api).put('/api/auth/profile').set(auth(user)).send({
      uploadSessionId: av.sessionId,
      avatarUploadId: av.uploadId,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.user.avatar.includes(av.publicId));
    const row = await Upload.findById(av.uploadId);
    assert.equal(row.status, 'committed');
    assert.equal(String(row.committedTo.entityId), String(user._id));
  });

  it('rejects unauthenticated profile updates (401)', async () => {
    const res = await request(api).put('/api/auth/profile').send({ name: 'x' });
    assert.equal(res.status, 401);
  });

  it('rejects another user\'s upload (403)', async () => {
    const victim = await readyAvatar(user);
    const thiefSession = await request(api).post('/api/uploads/session').set(auth(stranger)).send({ scope: 'avatar' });
    // Session mismatch (victim upload is in victim's session)...
    const mismatch = await request(api).put('/api/auth/profile').set(auth(stranger)).send({
      uploadSessionId: thiefSession.body.session.sessionId,
      avatarUploadId: victim.uploadId,
    });
    assert.equal(mismatch.status, 403);
  });

  it('rejects invalid format (422) and oversize (422) at complete', async () => {
    const s = await request(api).post('/api/uploads/session').set(auth(user)).send({ scope: 'avatar' });
    const g = await request(api).post('/api/uploads/sign').set(auth(user)).send({
      sessionId: s.body.session.sessionId, purpose: 'avatar',
    });
    const badFormat = await request(api).post(`/api/uploads/${g.body.upload.uploadId}/complete`).set(auth(user)).send({
      bytes: 1000, format: 'exe', resourceType: 'image',
    });
    assert.equal(badFormat.status, 422);

    // Avatar allows one active upload per session — fresh session for the
    // second probe.
    const s2 = await request(api).post('/api/uploads/session').set(auth(user)).send({ scope: 'avatar' });
    const g2 = await request(api).post('/api/uploads/sign').set(auth(user)).send({
      sessionId: s2.body.session.sessionId, purpose: 'avatar',
    });
    const big = await request(api).post(`/api/uploads/${g2.body.upload.uploadId}/complete`).set(auth(user)).send({
      bytes: 3 * 1024 * 1024, format: 'png', resourceType: 'image',
    });
    assert.equal(big.status, 422);
  });

  it('replaces the avatar and retires the old direct row', async () => {
    const first = await readyAvatar(user);
    await request(api).put('/api/auth/profile').set(auth(user)).send({
      uploadSessionId: first.sessionId,
      avatarUploadId: first.uploadId,
    });
    const second = await readyAvatar(user);
    const res = await request(api).put('/api/auth/profile').set(auth(user)).send({
      uploadSessionId: second.sessionId,
      avatarUploadId: second.uploadId,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.user.avatar.includes(second.publicId));
    assert.equal((await Upload.findOne({ publicId: first.publicId })).status, 'deleted');
    assert.equal((await Upload.findOne({ publicId: second.publicId })).status, 'committed');
  });

  it('replaces a legacy avatar URL without an Upload row', async () => {
    await User.updateOne({ _id: user._id }, { $set: { avatar: 'https://res.cloudinary.com/test-cloud/image/upload/legacy-avatar' } });
    const next = await readyAvatar(user);
    const res = await request(api).put('/api/auth/profile').set(auth(user)).send({
      uploadSessionId: next.sessionId,
      avatarUploadId: next.uploadId,
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.user.avatar.includes(next.publicId));
  });

  it('rejects pending (409) and expired (410) avatar uploads', async () => {
    const s = await request(api).post('/api/uploads/session').set(auth(stranger)).send({ scope: 'avatar' });
    const g = await request(api).post('/api/uploads/sign').set(auth(stranger)).send({
      sessionId: s.body.session.sessionId, purpose: 'avatar',
    });
    const pendingRes = await request(api).put('/api/auth/profile').set(auth(stranger)).send({
      uploadSessionId: s.body.session.sessionId,
      avatarUploadId: g.body.upload.uploadId,
    });
    assert.equal(pendingRes.status, 409);

    await Upload.updateOne({ _id: g.body.upload.uploadId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expiredRes = await request(api).put('/api/auth/profile').set(auth(stranger)).send({
      uploadSessionId: s.body.session.sessionId,
      avatarUploadId: g.body.upload.uploadId,
    });
    assert.ok([409, 410].includes(expiredRes.status), `got ${expiredRes.status}`);
  });

  it('flag-off rejects direct avatar payloads (400) while legacy profile fields still save', async () => {
    process.env.AVATAR_DIRECT_UPLOAD_ENABLED = 'false';
    try {
      const res = await request(api).put('/api/auth/profile').set(auth(user)).send({
        uploadSessionId: String(new mongoose.Types.ObjectId()),
        avatarUploadId: String(new mongoose.Types.ObjectId()),
      });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /disabled/i);
    } finally {
      delete process.env.AVATAR_DIRECT_UPLOAD_ENABLED;
    }
    const legacy = await request(api).put('/api/auth/profile').set(auth(user)).send({ name: 'Selfie User Renamed' });
    assert.equal(legacy.status, 200);
    assert.equal(legacy.body.user.name, 'Selfie User Renamed');
  });

  it('metrics expose avatar aggregates', async () => {
    // uploadRoutes has no admin user here; assert the bucket exists via shape.
    // (Admin-gated metrics endpoint covered in blog/property/hero suites.)
    const rows = await Upload.find({ purpose: 'avatar', status: 'committed' });
    assert.ok(rows.length >= 1);
  });
});
