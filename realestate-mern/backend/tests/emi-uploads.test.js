// Phase 4 — EMI slip direct-upload migration tests.
// Run: node --test tests/emi-uploads.test.js
// Cloudinary is never touched (signing is local HMAC, destroy stubbed).
// Slips are RESTRICTED media: private delivery, buyer-only upload bound to
// one plan+installment at sign time, no permanent URL in business records,
// short-lived signed viewing for buyer/admin/assigned-agent.
// Covers: authorized submit, no-slip submit, foreign-plan rejection,
// invalid plan/installment, wrong-purpose/session rejection, pending/
// expired states, duplicate-pending 409, reject→resubmit replacement +
// old retirement, revert-to-pending clear + retire, slip viewing authZ
// (incl. legacy passthrough), flag-off, metrics.
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'emi-uploads-test-secret';
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'test-cloud';
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || 'test-key';
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const { resetSignLimits } = require('../middleware/uploadRateLimit');
const cloudinaryUtil = require('../utils/cloudinary');
const User = require('../models/User');
const Upload = require('../models/Upload');
const EMIPlan = require('../models/EMIPlan');
// Registered for DETAIL_POPULATE paths in the verification-request response.
require('../models/Property');
require('../models/Sale');
const emiPlanRoutes = require('../routes/emiPlanRoutes');
const uploadRoutes = require('../routes/uploadRoutes');

describe('Phase 4 EMI slip direct upload', () => {
  let mongod;
  let api;
  let admin;
  let agent;
  let buyer;
  let buyerTwo;
  let stranger;

  const auth = (u) => ({ Authorization: `Bearer ${generateToken(u._id, u.role)}` });

  const makePlan = async (owner, n = 2) => {
    const installments = [];
    for (let i = 1; i <= n; i++) {
      installments.push({
        installmentNumber: i,
        dueDate: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000),
        amount: 10000,
        status: 'pending',
      });
    }
    return EMIPlan.create({
      sale: new mongoose.Types.ObjectId(),
      property: new mongoose.Types.ObjectId(),
      buyer: owner._id,
      agent: agent._id,
      principalAmount: 10000 * n,
      tenureMonths: n,
      installmentAmount: 10000,
      startDate: new Date(),
      installments,
    });
  };

  // Sign + complete an emi-slip for (plan, n) in a fresh emi session.
  const readySlip = async (u, planId, installmentNo) => {
    const s = await request(api).post('/api/uploads/session').set(auth(u)).send({ scope: 'emi' });
    assert.equal(s.status, 201);
    const g = await request(api).post('/api/uploads/sign').set(auth(u)).send({
      sessionId: s.body.session.sessionId, purpose: 'emi-slip', planId: String(planId), installmentNo,
    });
    assert.equal(g.status, 201);
    assert.equal(g.body.upload.deliveryType, 'private');
    const c = await request(api).post(`/api/uploads/${g.body.upload.uploadId}/complete`).set(auth(u)).send({
      bytes: 150000, format: 'jpg', resourceType: 'image',
    });
    assert.equal(c.status, 200);
    return { uploadId: g.body.upload.uploadId, publicId: `${g.body.upload.folder}/${g.body.upload.publicId}`, sessionId: s.body.session.sessionId };
  };

  const submitSlip = (u, planId, n, extra = {}) =>
    request(api).post(`/api/emi-plans/${planId}/installments/${n}/verification-request`).set(auth(u)).send({
      paidAmount: 10000, paidDate: new Date().toISOString().slice(0, 10), note: 'bank transfer', ...extra,
    });

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    cloudinaryUtil.cloudinary.uploader.destroy = async () => ({ result: 'ok' });

    const app = express();
    app.use(express.json());
    app.use('/api/emi-plans', emiPlanRoutes);
    app.use('/api/uploads', uploadRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, agent, buyer, buyerTwo, stranger] = await Promise.all([
      User.create({ name: 'Admin', email: 'eu-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'Agent', email: 'eu-agent@test.com', password: 'password1', role: 'agent', verificationStatus: 'verified' }),
      User.create({ name: 'Buyer', email: 'eu-buyer@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Buyer2', email: 'eu-buyer2@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
      User.create({ name: 'Stranger', email: 'eu-stranger@test.com', password: 'password1', role: 'user', verificationStatus: 'verified' }),
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  beforeEach(() => {
    resetSignLimits();
  });

  it('authorized buyer submits a slip: private publicId stored, no public URL, row committed', async () => {
    const plan = await makePlan(buyer);
    const slip = await readySlip(buyer, plan._id, 1);
    const res = await submitSlip(buyer, plan._id, 1, {
      paymentSlipUploadId: slip.uploadId,
      uploadSessionId: slip.sessionId,
    });
    assert.equal(res.status, 201);
    const v = res.body.plan.installments.find((i) => i.installmentNumber === 1).verification;
    assert.equal(v.status, 'pending');
    assert.equal(v.paymentSlipUrl, '');
    assert.equal(v.paymentSlipPublicId, slip.publicId);
    const row = await Upload.findById(slip.uploadId);
    assert.equal(row.status, 'committed');
    assert.equal(String(row.context.planId), String(plan._id));
    assert.equal(String(row.committedTo.entityId), String(plan._id));
  });

  it('submit without a slip still works (slip optional)', async () => {
    const plan = await makePlan(buyer);
    const res = await submitSlip(buyer, plan._id, 1, { paymentSlipUploadId: null });
    assert.equal(res.status, 201);
    const v = res.body.plan.installments.find((i) => i.installmentNumber === 1).verification;
    assert.equal(v.paymentSlipUrl, '');
    assert.equal(v.paymentSlipPublicId || '', '');
  });

  it('rejects foreign plans (403/404), bad installments (404), and duplicate pending (409)', async () => {
    const plan = await makePlan(buyer);
    const slip = await readySlip(buyer, plan._id, 1);

    // Another buyer's session can't even sign for this plan...
    const thiefSession = await request(api).post('/api/uploads/session').set(auth(buyerTwo)).send({ scope: 'emi' });
    const thiefSign = await request(api).post('/api/uploads/sign').set(auth(buyerTwo)).send({
      sessionId: thiefSession.body.session.sessionId, purpose: 'emi-slip',
      planId: String(plan._id), installmentNo: 1,
    });
    assert.equal(thiefSign.status, 403);

    // ...and a stolen uploadId can't attach to their own plan either.
    const otherPlan = await makePlan(buyerTwo);
    const stolen = await submitSlip(buyerTwo, otherPlan._id, 1, {
      paymentSlipUploadId: slip.uploadId,
      uploadSessionId: thiefSession.body.session.sessionId,
    });
    assert.equal(stolen.status, 403);

    const noPlan = await submitSlip(buyer, new mongoose.Types.ObjectId(), 1, {
      paymentSlipUploadId: slip.uploadId,
      uploadSessionId: slip.sessionId,
    });
    assert.equal(noPlan.status, 404);

    const noInst = await submitSlip(buyer, plan._id, 99, {
      paymentSlipUploadId: slip.uploadId,
      uploadSessionId: slip.sessionId,
    });
    assert.equal(noInst.status, 404);

    const first = await submitSlip(buyer, plan._id, 1, {
      paymentSlipUploadId: slip.uploadId,
      uploadSessionId: slip.sessionId,
    });
    assert.equal(first.status, 201);
    const dup = await submitSlip(buyer, plan._id, 1, {
      paymentSlipUploadId: slip.uploadId,
      uploadSessionId: slip.sessionId,
    });
    assert.equal(dup.status, 409);
  });

  it('rejects wrong-purpose uploads, pending and expired states', async () => {
    const plan = await makePlan(buyer);
    // Property upload can't enter an emi session (scope gate).
    const propSession = await request(api).post('/api/uploads/session').set(auth(buyer)).send({ scope: 'property' });
    const propSign = await request(api).post('/api/uploads/sign').set(auth(buyer)).send({
      sessionId: propSession.body.session.sessionId, purpose: 'property-image',
    });
    assert.equal(propSign.status, 201);
    await request(api).post(`/api/uploads/${propSign.body.upload.uploadId}/complete`).set(auth(buyer)).send({
      bytes: 1000, format: 'jpg',
    });
    const emiSession = await request(api).post('/api/uploads/session').set(auth(buyer)).send({ scope: 'emi' });
    const wrong = await submitSlip(buyer, plan._id, 1, {
      paymentSlipUploadId: propSign.body.upload.uploadId,
      uploadSessionId: emiSession.body.session.sessionId,
    });
    assert.equal(wrong.status, 403);

    const s = await request(api).post('/api/uploads/session').set(auth(buyer)).send({ scope: 'emi' });
    const g = await request(api).post('/api/uploads/sign').set(auth(buyer)).send({
      sessionId: s.body.session.sessionId, purpose: 'emi-slip',
      planId: String(plan._id), installmentNo: 1,
    });
    const pendingRes = await submitSlip(buyer, plan._id, 1, {
      paymentSlipUploadId: g.body.upload.uploadId,
      uploadSessionId: s.body.session.sessionId,
    });
    assert.equal(pendingRes.status, 409);

    await Upload.updateOne({ _id: g.body.upload.uploadId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    const expiredRes = await submitSlip(buyer, plan._id, 1, {
      paymentSlipUploadId: g.body.upload.uploadId,
      uploadSessionId: s.body.session.sessionId,
    });
    assert.ok([409, 410].includes(expiredRes.status), `got ${expiredRes.status}`);
  });

  it('reject → resubmit replaces the slip and retires the old row', async () => {
    const plan = await makePlan(buyer);
    const first = await readySlip(buyer, plan._id, 1);
    const submitted = await submitSlip(buyer, plan._id, 1, {
      paymentSlipUploadId: first.uploadId,
      uploadSessionId: first.sessionId,
    });
    assert.equal(submitted.status, 201);

    const review = await request(api)
      .patch(`/api/emi-plans/${plan._id}/installments/1/verification-request`)
      .set(auth(admin))
      .send({ action: 'reject', reviewNote: 'Blurry photo, please resend.' });
    assert.equal(review.status, 200);

    const second = await readySlip(buyer, plan._id, 1);
    const resub = await submitSlip(buyer, plan._id, 1, {
      paymentSlipUploadId: second.uploadId,
      uploadSessionId: second.sessionId,
    });
    assert.equal(resub.status, 201);
    const v = resub.body.plan.installments.find((i) => i.installmentNumber === 1).verification;
    assert.equal(v.paymentSlipPublicId, second.publicId);
    assert.equal((await Upload.findOne({ publicId: first.publicId })).status, 'deleted');
    assert.equal((await Upload.findOne({ publicId: second.publicId })).status, 'committed');
  });

  it('revert-to-pending clears the slip reference and retires its row', async () => {
    const plan = await makePlan(buyer);
    const slip = await readySlip(buyer, plan._id, 1);
    await submitSlip(buyer, plan._id, 1, {
      paymentSlipUploadId: slip.uploadId,
      uploadSessionId: slip.sessionId,
    });
    // paid → pending is the transition that resets the verification slate.
    const paid = await request(api)
      .patch(`/api/emi-plans/${plan._id}/installments/1`)
      .set(auth(admin))
      .send({ status: 'paid', paidAmount: 10000 });
    assert.equal(paid.status, 200);
    const revert = await request(api)
      .patch(`/api/emi-plans/${plan._id}/installments/1`)
      .set(auth(admin))
      .send({ status: 'pending' });
    assert.equal(revert.status, 200);
    const v = revert.body.plan.installments.find((i) => i.installmentNumber === 1).verification;
    assert.equal(v.paymentSlipPublicId || '', '');
    assert.equal((await Upload.findOne({ publicId: slip.publicId })).status, 'deleted');
  });

  it('slip viewing: buyer/admin/agent allowed, stranger denied, legacy passthrough', async () => {
    const plan = await makePlan(buyer);
    const slip = await readySlip(buyer, plan._id, 1);
    await submitSlip(buyer, plan._id, 1, {
      paymentSlipUploadId: slip.uploadId,
      uploadSessionId: slip.sessionId,
    });

    for (const viewer of [buyer, admin, agent]) {
      const view = await request(api).get(`/api/emi-plans/${plan._id}/installments/1/slip`).set(auth(viewer));
      assert.equal(view.status, 200, `viewer ${viewer.role} got ${view.status}`);
      // Private delivery: authenticated download URL carrying the publicId
      // and a signature — never a permanent public URL. (Slashes arrive
      // percent-encoded in the query string, so decode before comparing.)
      const decodedUrl = decodeURIComponent(view.body.url);
      assert.ok(decodedUrl.includes(slip.publicId), view.body.url);
      assert.ok(view.body.url.includes('signature='), view.body.url);
      assert.equal(view.body.legacy, false);
      assert.ok(view.body.expiresAt);
    }
    const denied = await request(api).get(`/api/emi-plans/${plan._id}/installments/1/slip`).set(auth(stranger));
    assert.equal(denied.status, 403);
    const anon = await request(api).get(`/api/emi-plans/${plan._id}/installments/1/slip`);
    assert.equal(anon.status, 401);

    // Legacy slip (plain URL) passes through unchanged.
    const legacyPlan = await makePlan(buyerTwo);
    await EMIPlan.updateOne(
      { _id: legacyPlan._id, 'installments.installmentNumber': 1 },
      { $set: { 'installments.$.verification': { status: 'pending', paymentSlipUrl: 'http://x/slip.jpg' } } }
    );
    const legacyView = await request(api).get(`/api/emi-plans/${legacyPlan._id}/installments/1/slip`).set(auth(admin));
    assert.equal(legacyView.status, 200);
    assert.equal(legacyView.body.url, 'http://x/slip.jpg');
    assert.equal(legacyView.body.legacy, true);

    const empty = await request(api).get(`/api/emi-plans/${legacyPlan._id}/installments/2/slip`).set(auth(admin));
    assert.equal(empty.status, 404);
  });

  it('non-buyers cannot open emi sessions; flag-off rejects direct payloads (400)', async () => {
    const agentSession = await request(api).post('/api/uploads/session').set(auth(agent)).send({ scope: 'emi' });
    assert.equal(agentSession.status, 403);

    const plan = await makePlan(buyer);
    process.env.EMI_DIRECT_UPLOAD_ENABLED = 'false';
    try {
      const res = await submitSlip(buyer, plan._id, 1, {
        paymentSlipUploadId: String(new mongoose.Types.ObjectId()),
        uploadSessionId: String(new mongoose.Types.ObjectId()),
      });
      assert.equal(res.status, 400);
      assert.match(res.body.message, /disabled/i);
    } finally {
      delete process.env.EMI_DIRECT_UPLOAD_ENABLED;
    }
  });

  it('metrics expose emi-slip aggregates to admins only', async () => {
    const adminView = await request(api).get('/api/uploads/metrics').set(auth(admin));
    assert.equal(adminView.status, 200);
    assert.ok(adminView.body.metrics.singleSubmit['emi-slip'].direct.count >= 1);
    const denied = await request(api).get('/api/uploads/metrics').set(auth(agent));
    assert.equal(denied.status, 403);
  });
});
