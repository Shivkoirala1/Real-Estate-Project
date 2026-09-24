// Innovation Ideas V1 — backend API tests.
// Run: node --test tests/innovation.test.js
// Covers model validation, auth/roles, immediate visibility, ownership,
// public search/pagination, admin moderation, media resolver integration
// and the 5-per-24h creation quota. Cloudinary is never touched
// (uploader.destroy is stubbed; uploads are completed via the real
// plausibility-only complete endpoint).
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'innovation-test-secret';
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
const InnovationIdea = require('../models/InnovationIdea');
const uploadRoutes = require('../routes/uploadRoutes');
const innovationRoutes = require('../routes/innovationRoutes');

describe('Innovation Ideas V1 API', () => {
  let mongod;
  let api;
  let admin;
  let verifiedUser;
  let otherUser;
  let pendingUser;
  let agent;
  let rateUser;
  let mediaUser;
  let abuseUser;
  let updateUser;
  let deleteUser;
  let detailUser;
  let mediaUser2;
  let listerUser;

  const auth = (user) => (user ? { Authorization: `Bearer ${generateToken(user._id, user.role)}` } : {});

  const ideaBody = (over = {}) => ({
    title: 'Community rainwater harvesting for hillside homes',
    category: 'sustainability',
    description:
      'Problem: dry-season water shortages. Idea: shared rooftop collection tanks. Impact: lower water bills for hillside homes.',
    ...over,
  });

  const submit = (user, body) => request(api).post('/api/innovations').set(auth(user)).send(body);

  const openInnovationSession = async (user) => {
    const res = await request(api).post('/api/uploads/session').set(auth(user)).send({ scope: 'innovation' });
    assert.equal(res.status, 201);
    return res.body.session.sessionId;
  };

  // Full sign → complete cycle through the real endpoints (no Cloudinary
  // network: complete only checks plausibility of client-reported meta).
  const signComplete = async (user, sessionId, purpose, over = {}) => {
    const s = await request(api).post('/api/uploads/sign').set(auth(user)).send({ sessionId, purpose });
    assert.equal(s.status, 201);
    const id = s.body.upload.uploadId;
    const format = over.format || (purpose === 'innovation-video' ? 'mp4' : 'jpg');
    const c = await request(api)
      .post(`/api/uploads/${id}/complete`)
      .set(auth(user))
      .send({ bytes: over.bytes || 50000, format });
    assert.equal(c.status, 200);
    return id;
  };

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    cloudinaryUtil.cloudinary.uploader.destroy = async () => ({ result: 'ok' });

    const app = express();
    app.use(express.json());
    app.use('/api/uploads', uploadRoutes);
    app.use('/api/innovations', innovationRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, verifiedUser, otherUser, pendingUser, agent, rateUser, mediaUser, abuseUser, updateUser, deleteUser, detailUser, mediaUser2, listerUser] = await Promise.all([
      User.create({ name: 'Admin', email: 'in-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'Verified', email: 'in-verified@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Other', email: 'in-other@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Pending', email: 'in-pending@test.com', password: 'password1', role: 'user' }),
      User.create({ name: 'Agent', email: 'in-agent@test.com', password: 'password1', role: 'agent', verificationStatus: 'verified' }),
      User.create({ name: 'Rater', email: 'in-rater@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Media', email: 'in-media@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Abuser', email: 'in-abuser@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Updater', email: 'in-updater@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Deleter', email: 'in-deleter@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Detail', email: 'in-detail@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Media2', email: 'in-media2@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Lister', email: 'in-lister@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => {
    resetSignLimits();
  });

  it('validates model fields (title, category, description, image cap)', async () => {
    const bad = new InnovationIdea({
      title: 'abc',
      category: 'bogus',
      description: 'short',
      images: ['a', 'b', 'c', 'd', 'e', 'f'],
      submittedBy: verifiedUser._id,
    }).validateSync();
    assert.ok(bad.errors.title);
    assert.ok(bad.errors.category);
    assert.ok(bad.errors.description);
    assert.ok(bad.errors.images);
    const good = new InnovationIdea({ ...ideaBody(), submittedBy: verifiedUser._id }).validateSync();
    assert.equal(good, undefined);
  });

  it('guest POST → 401, unverified POST → 403, agent POST → 403', async () => {
    assert.equal((await submit(null, ideaBody())).status, 401);
    assert.equal((await submit(pendingUser, ideaBody())).status, 403);
    assert.equal((await submit(agent, ideaBody())).status, 403);
  });

  it('public and owner lists expose author name but not email; unverified/agent DELETE → 403', async () => {
    const created = await submit(otherUser, ideaBody({ title: 'Author privacy marker idea' }));
    assert.equal(created.status, 201);
    const pub = await request(api).get('/api/innovations/public').query({ q: 'Author privacy marker' });
    assert.equal(pub.body.innovations[0].submittedBy.name, 'Other');
    assert.equal(pub.body.innovations[0].submittedBy.email, undefined);
    const mine = await request(api).get('/api/innovations/mine').set(auth(otherUser)).query({ q: 'Author privacy marker' });
    assert.equal(mine.body.innovations[0].submittedBy.email, undefined);
    const listed = await request(api).get('/api/innovations/admin').set(auth(admin)).query({ q: 'Author privacy marker' });
    assert.equal(listed.body.innovations[0].submittedBy.email, 'in-other@test.com');

    // Ideas planted directly for accounts that cannot submit via the API.
    const pendingOwned = await InnovationIdea.create({ ...ideaBody({ title: 'Pending-owned delete target' }), submittedBy: pendingUser._id });
    const agentOwned = await InnovationIdea.create({ ...ideaBody({ title: 'Agent-owned delete target' }), submittedBy: agent._id });
    assert.equal((await request(api).delete(`/api/innovations/${pendingOwned._id}`).set(auth(pendingUser))).status, 403);
    assert.equal((await request(api).delete(`/api/innovations/${agentOwned._id}`).set(auth(agent))).status, 403);
    assert.equal(await InnovationIdea.countDocuments({ _id: { $in: [pendingOwned._id, agentOwned._id] } }), 2);
  });

  it('verified user POST → 201 and admin POST → 201, both immediately visible', async () => {
    const u = await submit(verifiedUser, ideaBody({ title: 'User idea visible at once' }));
    assert.equal(u.status, 201);
    assert.equal(u.body.innovation.isVisible, true);
    const a = await submit(admin, ideaBody({ title: 'Admin idea visible at once' }));
    assert.equal(a.status, 201);
    assert.equal(a.body.innovation.isVisible, true);
  });

  it('rejects invalid title, category and description with 400', async () => {
    assert.equal((await submit(otherUser, ideaBody({ title: 'abc' }))).status, 400);
    assert.equal((await submit(otherUser, ideaBody({ category: 'nope' }))).status, 400);
    assert.equal((await submit(otherUser, ideaBody({ description: 'too short' }))).status, 400);
  });

  it('ignores a client-supplied isVisible:false on create', async () => {
    const res = await submit(otherUser, ideaBody({ title: 'Forced visible idea', isVisible: false }));
    assert.equal(res.status, 201);
    assert.equal(res.body.innovation.isVisible, true);
  });

  it('hidden ideas are excluded from public, shown again after admin shows', async () => {
    const created = await submit(verifiedUser, ideaBody({ title: 'Hide-and-show lifecycle idea' }));
    const id = created.body.innovation._id;
    await request(api).patch(`/api/innovations/${id}/visibility`).set(auth(admin)).send({ isVisible: false });
    const hidden = await request(api).get('/api/innovations/public').query({ q: 'Hide-and-show lifecycle' });
    assert.ok(!hidden.body.innovations.some((i) => String(i._id) === String(id)));
    await request(api).patch(`/api/innovations/${id}/visibility`).set(auth(admin)).send({ isVisible: true });
    const shown = await request(api).get('/api/innovations/public').query({ q: 'Hide-and-show lifecycle' });
    assert.ok(shown.body.innovations.some((i) => String(i._id) === String(id)));
  });

  it('non-owners cannot edit or delete; owners and admins can (incl. hidden)', async () => {
    const created = await submit(verifiedUser, ideaBody({ title: 'Ownership guard idea' }));
    const id = created.body.innovation._id;
    assert.equal((await request(api).put(`/api/innovations/${id}`).set(auth(otherUser)).send({ title: 'Hijacked title here' })).status, 403);
    assert.equal((await request(api).delete(`/api/innovations/${id}`).set(auth(otherUser))).status, 403);
    // Admin hides it; owner can still edit and delete it.
    await request(api).patch(`/api/innovations/${id}/visibility`).set(auth(admin)).send({ isVisible: false });
    const edit = await request(api).put(`/api/innovations/${id}`).set(auth(verifiedUser)).send({ title: 'Owner edited hidden idea title' });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.innovation.title, 'Owner edited hidden idea title');
    assert.equal((await request(api).delete(`/api/innovations/${id}`).set(auth(verifiedUser))).status, 200);
    // Admin edits/deletes any idea.
    const again = await submit(verifiedUser, ideaBody({ title: 'Admin moderation target idea' }));
    const aid = again.body.innovation._id;
    assert.equal((await request(api).put(`/api/innovations/${aid}`).set(auth(admin)).send({ title: 'Admin edited any idea title' })).status, 200);
    assert.equal((await request(api).delete(`/api/innovations/${aid}`).set(auth(admin))).status, 200);
  });

  it('public listing: only visible, newest first, paginated, searchable, regex-safe', async () => {
    const t = Date.now();
    await submit(listerUser, ideaBody({ title: `First public token-${t}`, description: 'A sufficiently long description for the first public idea here.' }));
    await submit(listerUser, ideaBody({ title: `Second public token-${t}`, description: 'A sufficiently long description for the second public idea here.' }));
    const third = await submit(listerUser, ideaBody({ title: `Third public token-${t}`, description: 'Searchable zebracorn description for the third public idea.' }));
    const hidden = await submit(listerUser, ideaBody({ title: `Hidden public token-${t}`, description: 'A sufficiently long description for the hidden public idea here.' }));
    await request(api).patch(`/api/innovations/${hidden.body.innovation._id}/visibility`).set(auth(admin)).send({ isVisible: false });

    const all = await request(api).get('/api/innovations/public').query({ q: `token-${t}`, limit: 50 });
    assert.equal(all.status, 200);
    const ids = all.body.innovations.map((i) => String(i._id));
    assert.ok(!ids.includes(String(hidden.body.innovation._id)));
    assert.deepEqual(ids.slice(0, 3), [String(third.body.innovation._id)].concat(ids.slice(1, 3)));
    assert.equal(ids[0], String(third.body.innovation._id)); // newest first
    assert.ok(all.body.pagination.total >= 3);

    const p1 = await request(api).get('/api/innovations/public').query({ q: `token-${t}`, limit: 1, page: 1 });
    const p2 = await request(api).get('/api/innovations/public').query({ q: `token-${t}`, limit: 1, page: 2 });
    assert.equal(p1.body.innovations.length, 1);
    assert.equal(p2.body.innovations.length, 1);
    assert.notEqual(String(p1.body.innovations[0]._id), String(p2.body.innovations[0]._id));

    const byTitle = await request(api).get('/api/innovations/public').query({ q: `Second public token-${t}` });
    assert.ok(byTitle.body.innovations.some((i) => i.title.includes('Second public')));
    const byDesc = await request(api).get('/api/innovations/public').query({ q: 'zebracorn' });
    assert.ok(byDesc.body.innovations.some((i) => String(i._id) === String(third.body.innovation._id)));

    const evil = await request(api).get('/api/innovations/public').query({ q: '([a.*+test' });
    assert.equal(evil.status, 200);
  });

  it('mine returns own visible + hidden; admin lists all with visibility filter', async () => {
    const vis = await submit(mediaUser, ideaBody({ title: 'Mine visible marker idea' }));
    const hid = await submit(mediaUser, ideaBody({ title: 'Mine hidden marker idea' }));
    await request(api).patch(`/api/innovations/${hid.body.innovation._id}/visibility`).set(auth(admin)).send({ isVisible: false });

    const mine = await request(api).get('/api/innovations/mine').set(auth(mediaUser)).query({ q: 'marker idea' });
    const mineIds = mine.body.innovations.map((i) => String(i._id));
    assert.ok(mineIds.includes(String(vis.body.innovation._id)));
    assert.ok(mineIds.includes(String(hid.body.innovation._id)));

    assert.equal((await request(api).get('/api/innovations/admin').set(auth(mediaUser))).status, 403);
    const all = await request(api).get('/api/innovations/admin').set(auth(admin)).query({ q: 'marker idea' });
    assert.ok(all.body.innovations.map((i) => String(i._id)).includes(String(hid.body.innovation._id)));
    assert.ok(all.body.innovations[0].submittedBy && all.body.innovations[0].submittedBy.name);
    const onlyHidden = await request(api).get('/api/innovations/admin').set(auth(admin)).query({ q: 'marker idea', visibility: 'hidden' });
    assert.ok(onlyHidden.body.innovations.length >= 1);
    assert.ok(onlyHidden.body.innovations.every((i) => i.isVisible === false));
    const onlyVisible = await request(api).get('/api/innovations/admin').set(auth(admin)).query({ q: 'marker idea', visibility: 'visible' });
    assert.ok(onlyVisible.body.innovations.every((i) => i.isVisible === true));
    const badFilter = await request(api).get('/api/innovations/admin').set(auth(admin)).query({ visibility: 'nope' });
    assert.equal(badFilter.status, 400);
  });

  it('visibility toggle requires boolean and admin; non-admins get 403', async () => {
    const created = await submit(verifiedUser, ideaBody({ title: 'Visibility toggle guard idea' }));
    const id = created.body.innovation._id;
    assert.equal((await request(api).patch(`/api/innovations/${id}/visibility`).set(auth(otherUser)).send({ isVisible: false })).status, 403);
    assert.equal((await request(api).patch(`/api/innovations/${id}/visibility`).set(auth(admin)).send({})).status, 400);
    assert.equal((await request(api).patch(`/api/innovations/${id}/visibility`).set(auth(admin)).send({ isVisible: 'no' })).status, 400);
    const off = await request(api).patch(`/api/innovations/${id}/visibility`).set(auth(admin)).send({ isVisible: false });
    assert.equal(off.status, 200);
    assert.equal(off.body.innovation.isVisible, false);
  });

  it('handles media: none, images, video, both; derives video thumbnail', async () => {
    const bare = await submit(mediaUser, ideaBody({ title: 'Bare idea without any media' }));
    assert.equal(bare.status, 201);
    assert.deepEqual(bare.body.innovation.images, []);
    assert.equal(bare.body.innovation.videoUrl, null);

    const s1 = await openInnovationSession(mediaUser);
    const img1 = await signComplete(mediaUser, s1, 'innovation-image');
    const img2 = await signComplete(mediaUser, s1, 'innovation-image');
    const withImages = await submit(mediaUser, { ...ideaBody({ title: 'Idea with two images attached' }), uploadSessionId: s1, imageUploadIds: [img1, img2] });
    assert.equal(withImages.status, 201);
    assert.equal(withImages.body.innovation.images.length, 2);
    const committed = await Upload.find({ _id: { $in: [img1, img2] } });
    assert.ok(committed.every((u) => u.status === 'committed' && u.committedTo.entityType === 'innovation'));

    const s2 = await openInnovationSession(mediaUser2);
    const vid = await signComplete(mediaUser2, s2, 'innovation-video');
    const withVideo = await submit(mediaUser2, { ...ideaBody({ title: 'Idea with a single video attached' }), uploadSessionId: s2, videoUploadId: vid });
    assert.equal(withVideo.status, 201);
    assert.ok(withVideo.body.innovation.videoUrl.includes('/video/upload/'));
    assert.ok(withVideo.body.innovation.videoThumbnail.includes('so_0'));

    const s3 = await openInnovationSession(mediaUser2);
    const img3 = await signComplete(mediaUser2, s3, 'innovation-image');
    const vid2 = await signComplete(mediaUser2, s3, 'innovation-video');
    const both = await submit(mediaUser2, { ...ideaBody({ title: 'Idea with images plus video attached' }), uploadSessionId: s3, imageUploadIds: [img3], videoUploadId: vid2 });
    assert.equal(both.status, 201);
    assert.equal(both.body.innovation.images.length, 1);
    assert.ok(both.body.innovation.videoUrl);
  });

  it('rejects media abuse: 6 images, 2 videos, foreign/wrong/p pending/committed uploads', async () => {
    const u = abuseUser;
    const s1 = await openInnovationSession(u);
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await signComplete(u, s1, 'innovation-image'));
    const s2 = await openInnovationSession(u);
    ids.push(await signComplete(u, s2, 'innovation-image'));
    const six = await submit(u, { ...ideaBody({ title: 'Six images must be rejected here' }), uploadSessionId: s1, imageUploadIds: ids });
    assert.equal(six.status, 400);

    const twoVid = await submit(u, { ...ideaBody({ title: 'Two videos must be rejected here' }), videoUploadId: [ids[0], ids[1]] });
    assert.equal(twoVid.status, 400);

    // Foreign upload (belongs to another user's session).
    const otherSession = await openInnovationSession(otherUser);
    const foreign = await signComplete(otherUser, otherSession, 'innovation-image');
    const mine = await openInnovationSession(u);
    const foreignRes = await submit(u, { ...ideaBody({ title: 'Foreign upload must be rejected' }), uploadSessionId: mine, imageUploadIds: [foreign] });
    assert.equal(foreignRes.status, 403);

    // Wrong purpose (video row passed as an image).
    const s3 = await openInnovationSession(u);
    const vidRow = await signComplete(u, s3, 'innovation-video');
    const wrongPurpose = await submit(u, { ...ideaBody({ title: 'Wrong purpose must be rejected' }), uploadSessionId: s3, imageUploadIds: [vidRow] });
    assert.equal(wrongPurpose.status, 422);

    // Incomplete (pending) upload.
    const s4 = await openInnovationSession(u);
    const signRes = await request(api).post('/api/uploads/sign').set(auth(u)).send({ sessionId: s4, purpose: 'innovation-image' });
    const pending = await submit(u, { ...ideaBody({ title: 'Pending upload must be rejected' }), uploadSessionId: s4, imageUploadIds: [signRes.body.upload.uploadId] });
    assert.equal(pending.status, 409);

    // Already committed elsewhere. Note: a successful submit closes its
    // session, so reopen it here to reach the committed-row check itself.
    const committedRes = await submit(u, { ...ideaBody({ title: 'First consumer of shared image' }), uploadSessionId: s1, imageUploadIds: [ids[0]] });
    assert.equal(committedRes.status, 201);
    await UploadSession.updateOne({ _id: s1 }, { $set: { status: 'open' } });
    const reuse = await submit(u, { ...ideaBody({ title: 'Second consumer of shared image' }), uploadSessionId: s1, imageUploadIds: [ids[0]] });
    assert.equal(reuse.status, 409);
  });

  it('update keeps media by default, supports keep-list, replace and remove', async () => {
    const u = updateUser;
    const s = await openInnovationSession(u);
    const img = await signComplete(u, s, 'innovation-image');
    const vid = await signComplete(u, s, 'innovation-video');
    const created = await submit(u, { ...ideaBody({ title: 'Media lifecycle update target' }), uploadSessionId: s, imageUploadIds: [img], videoUploadId: vid });
    const id = created.body.innovation._id;
    const origImages = created.body.innovation.images;
    const origVideo = created.body.innovation.videoUrl;

    const titleOnly = await request(api).put(`/api/innovations/${id}`).set(auth(u)).send({ title: 'Title-only edit keeps all media' });
    assert.equal(titleOnly.status, 200);
    assert.deepEqual(titleOnly.body.innovation.images, origImages);
    assert.equal(titleOnly.body.innovation.videoUrl, origVideo);

    const dropped = await request(api).put(`/api/innovations/${id}`).set(auth(u)).send({ keepImageUrls: [] });
    assert.equal(dropped.status, 200);
    assert.deepEqual(dropped.body.innovation.images, []);

    const removed = await request(api).put(`/api/innovations/${id}`).set(auth(u)).send({ removeVideo: true });
    assert.equal(removed.status, 200);
    assert.equal(removed.body.innovation.videoUrl, null);

    // Owners cannot flip visibility through the update endpoint.
    const sneak = await request(api).put(`/api/innovations/${id}`).set(auth(u)).send({ isVisible: false });
    assert.equal(sneak.status, 200);
    assert.equal(sneak.body.innovation.isVisible, true);
  });

  it('delete removes the idea and releases its upload rows', async () => {
    const u = deleteUser;
    const s = await openInnovationSession(u);
    const img = await signComplete(u, s, 'innovation-image');
    const created = await submit(u, { ...ideaBody({ title: 'Delete releases uploads target' }), uploadSessionId: s, imageUploadIds: [img] });
    const id = created.body.innovation._id;
    assert.equal((await request(api).delete(`/api/innovations/${id}`).set(auth(u))).status, 200);
    assert.equal(await InnovationIdea.countDocuments({ _id: id }), 0);
    const row = await Upload.findById(img);
    assert.equal(row.status, 'deleted');
  });

  it('enforces 5 submissions per user per 24 hours with 429', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await submit(rateUser, ideaBody({ title: `Quota filler idea number ${i} here` }));
      assert.equal(res.status, 201);
    }
    const sixth = await submit(rateUser, ideaBody({ title: 'Quota exceeding sixth idea here' }));
    assert.equal(sixth.status, 429);
    assert.ok(typeof sixth.body.retryAfterSec === 'number');
    assert.ok(sixth.headers['retry-after']);
  });

  it('has no public GET /:id detail endpoint and 404s unknown ids', async () => {
    const created = await submit(detailUser, ideaBody({ title: 'No detail endpoint marker idea' }));
    assert.equal((await request(api).get(`/api/innovations/${created.body.innovation._id}`)).status, 404);
    const fake = new mongoose.Types.ObjectId();
    assert.equal((await request(api).put(`/api/innovations/${fake}`).set(auth(detailUser)).send({ title: 'Ghost edit attempt here' })).status, 404);
    assert.equal((await request(api).delete(`/api/innovations/${fake}`).set(auth(detailUser))).status, 404);
    assert.equal((await request(api).patch(`/api/innovations/${fake}/visibility`).set(auth(admin)).send({ isVisible: false })).status, 404);
  });
});
