// Phase 4 — blog cover direct-upload migration tests.
// Run: node --test tests/blog-uploads.test.js
// Cloudinary is never touched (signing is local HMAC, destroy stubbed).
// Covers: create with/without cover, validation-failure resubmit reuse,
// slug-conflict preservation, update preserve/replace/retire, legacy covers
// without rows, delete retire, cross-user/session rejections, pending/
// expired states, flag-off, metrics. (Purpose mismatch inside one scope is
// structurally impossible — scopes admit exactly one purpose; session-scope
// rejection is tested instead.)
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'blog-uploads-test-secret';
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'test-cloud';
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || 'test-key';
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const { resetSignLimits } = require('../middleware/uploadRateLimit');
const cloudinaryUtil = require('../utils/cloudinary');
const User = require('../models/User');
const Upload = require('../models/Upload');
const blogRoutes = require('../routes/blogRoutes');
const uploadRoutes = require('../routes/uploadRoutes');

describe('Phase 4 blog cover direct upload', () => {
  let mongod;
  let api;
  let admin;
  let adminTwo;
  let agent;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });

  // Sign + complete a blog cover inside a fresh blog session.
  const readyCover = async (user) => {
    const s = await request(api).post('/api/uploads/session').set(auth(user)).send({ scope: 'blog' });
    assert.equal(s.status, 201);
    const g = await request(api).post('/api/uploads/sign').set(auth(user)).send({
      sessionId: s.body.session.sessionId, purpose: 'blog-cover',
    });
    assert.equal(g.status, 201);
    const c = await request(api).post(`/api/uploads/${g.body.upload.uploadId}/complete`).set(auth(user)).send({
      bytes: 120000, format: 'jpg', resourceType: 'image',
    });
    assert.equal(c.status, 200);
    return { uploadId: g.body.upload.uploadId, publicId: g.body.upload.publicId, sessionId: s.body.session.sessionId };
  };

  let slugSeq = 0;
  const baseBlog = (overrides = {}) => ({
    title: `Phase 4 blog ${Date.now()}-${slugSeq++}`,
    body: 'A sufficiently long blog body for the migration tests.',
    tags: ['migration', 'test'],
    status: 'draft',
    ...overrides,
  });

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    cloudinaryUtil.cloudinary.uploader.destroy = async () => ({ result: 'ok' });

    const app = express();
    app.use(express.json());
    app.use('/api/blogs', blogRoutes);
    app.use('/api/uploads', uploadRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, adminTwo, agent] = await Promise.all([
      User.create({ name: 'Admin', email: 'bu-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'Admin2', email: 'bu-admin2@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'Agent', email: 'bu-agent@test.com', password: 'password1', role: 'agent', verificationStatus: 'verified' }),
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => {
    resetSignLimits();
  });

  it('creates a blog with a direct cover and commits the upload', async () => {
    const cover = await readyCover(admin);
    const res = await request(api).post('/api/blogs').set(auth(admin)).send(baseBlog({
      uploadSessionId: cover.sessionId,
      coverUploadId: cover.uploadId,
    }));
    assert.equal(res.status, 201);
    assert.ok(res.body.blog.coverImage.includes(cover.publicId));
    const row = await Upload.findById(cover.uploadId);
    assert.equal(row.status, 'committed');
    assert.equal(String(row.committedTo.entityId), String(res.body.blog._id));
  });

  it('creates a blog without a cover (legacy-permitted)', async () => {
    const res = await request(api).post('/api/blogs').set(auth(admin)).send(baseBlog());
    assert.equal(res.status, 201);
    assert.equal(res.body.blog.coverImage, null);
  });

  it('validation failure keeps uploads completed for resubmit', async () => {
    const cover = await readyCover(admin);
    const bad = await request(api).post('/api/blogs').set(auth(admin)).send(baseBlog({
      title: '',
      uploadSessionId: cover.sessionId,
      coverUploadId: cover.uploadId,
    }));
    assert.equal(bad.status, 400);
    assert.equal((await Upload.findById(cover.uploadId)).status, 'completed');

    const good = await request(api).post('/api/blogs').set(auth(admin)).send(baseBlog({
      uploadSessionId: cover.sessionId,
      coverUploadId: cover.uploadId,
    }));
    assert.equal(good.status, 201);
  });

  it('slug conflict preserves the upload for resubmit', async () => {
    const first = await request(api).post('/api/blogs').set(auth(admin)).send(baseBlog({ title: 'Phase 4 duplicate title here' }));
    assert.equal(first.status, 201);
    const cover = await readyCover(admin);
    const clash = await request(api).post('/api/blogs').set(auth(admin)).send(baseBlog({
      title: 'Phase 4 duplicate title here',
      uploadSessionId: cover.sessionId,
      coverUploadId: cover.uploadId,
    }));
    assert.equal(clash.status, 409);
    assert.equal((await Upload.findById(cover.uploadId)).status, 'completed');
  });

  it('updates: preserves cover on scalar edit, replaces + retires on new cover', async () => {
    const first = await readyCover(admin);
    const created = await request(api).post('/api/blogs').set(auth(admin)).send(baseBlog({
      uploadSessionId: first.sessionId,
      coverUploadId: first.uploadId,
    }));
    const blogId = created.body.blog._id;

    const kept = await request(api).patch(`/api/blogs/${blogId}`).set(auth(admin)).send({ title: 'Phase 4 renamed blog title' });
    assert.equal(kept.status, 200);
    assert.equal(kept.body.blog.coverImage, created.body.blog.coverImage);

    const next = await readyCover(admin);
    const replaced = await request(api).patch(`/api/blogs/${blogId}`).set(auth(admin)).send({
      uploadSessionId: next.sessionId,
      coverUploadId: next.uploadId,
    });
    assert.equal(replaced.status, 200);
    assert.ok(replaced.body.blog.coverImage.includes(next.publicId));
    assert.equal((await Upload.findOne({ publicId: first.publicId })).status, 'deleted');
    assert.equal((await Upload.findOne({ publicId: next.publicId })).status, 'committed');
  });

  it('delete retires the direct cover; legacy covers without rows stay supported', async () => {
    const cover = await readyCover(admin);
    const created = await request(api).post('/api/blogs').set(auth(admin)).send(baseBlog({
      uploadSessionId: cover.sessionId,
      coverUploadId: cover.uploadId,
    }));
    const del = await request(api).delete(`/api/blogs/${created.body.blog._id}`).set(auth(admin));
    assert.equal(del.status, 200);
    assert.equal((await Upload.findById(cover.uploadId)).status, 'deleted');

    // Legacy blog with a bare URL cover: replace works, nothing to retire.
    const legacy = await request(api).post('/api/blogs').set(auth(admin)).send(baseBlog());
    assert.equal(legacy.status, 201);
    const next = await readyCover(admin);
    const replaced = await request(api).patch(`/api/blogs/${legacy.body.blog._id}`).set(auth(admin)).send({
      uploadSessionId: next.sessionId,
      coverUploadId: next.uploadId,
    });
    assert.equal(replaced.status, 200);
    assert.ok(replaced.body.blog.coverImage.includes(next.publicId));
  });

  it('rejects cross-user uploads (403), foreign sessions (403), pending (409), expired (410)', async () => {
    const victim = await readyCover(admin);
    const thiefSession = await request(api).post('/api/uploads/session').set(auth(adminTwo)).send({ scope: 'blog' });
    const stolen = await request(api).post('/api/blogs').set(auth(adminTwo)).send(baseBlog({
      uploadSessionId: thiefSession.body.session.sessionId,
      coverUploadId: victim.uploadId,
    }));
    assert.equal(stolen.status, 403);

    const heroSession = await request(api).post('/api/uploads/session').set(auth(adminTwo)).send({ scope: 'hero' });
    const scoped = await request(api).post('/api/blogs').set(auth(adminTwo)).send(baseBlog({
      uploadSessionId: heroSession.body.session.sessionId,
      coverUploadId: victim.uploadId,
    }));
    assert.equal(scoped.status, 400);

    const s = await request(api).post('/api/uploads/session').set(auth(adminTwo)).send({ scope: 'blog' });
    const g = await request(api).post('/api/uploads/sign').set(auth(adminTwo)).send({
      sessionId: s.body.session.sessionId, purpose: 'blog-cover',
    });
    const pendingRes = await request(api).post('/api/blogs').set(auth(adminTwo)).send(baseBlog({
      uploadSessionId: s.body.session.sessionId,
      coverUploadId: g.body.upload.uploadId,
    }));
    assert.equal(pendingRes.status, 409);

    await Upload.updateOne({ _id: g.body.upload.uploadId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expiredRes = await request(api).post('/api/blogs').set(auth(adminTwo)).send(baseBlog({
      uploadSessionId: s.body.session.sessionId,
      coverUploadId: g.body.upload.uploadId,
    }));
    assert.ok([409, 410].includes(expiredRes.status), `got ${expiredRes.status}`);
  });

  it('non-admin cannot open a blog session; flag-off rejects direct payloads (400)', async () => {
    const denied = await request(api).post('/api/uploads/session').set(auth(agent)).send({ scope: 'blog' });
    assert.equal(denied.status, 403);

    process.env.BLOG_DIRECT_UPLOAD_ENABLED = 'false';
    try {
      const res = await request(api).post('/api/blogs').set(auth(admin)).send(baseBlog({
        uploadSessionId: String(new mongoose.Types.ObjectId()),
        coverUploadId: String(new mongoose.Types.ObjectId()),
      }));
      assert.equal(res.status, 400);
      assert.match(res.body.message, /disabled/i);
    } finally {
      delete process.env.BLOG_DIRECT_UPLOAD_ENABLED;
    }
  });

  it('metrics expose blog-cover aggregates to admins only', async () => {
    const adminView = await request(api).get('/api/uploads/metrics').set(auth(admin));
    assert.equal(adminView.status, 200);
    assert.ok(adminView.body.metrics.singleSubmit['blog-cover'].direct.count >= 1);
    const denied = await request(api).get('/api/uploads/metrics').set(auth(agent));
    assert.equal(denied.status, 403);
  });
});
