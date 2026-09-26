// Two-phase commission payout — verify-time split, ordered payouts,
// legacy alias, totals/summary/analytics, migration backfill.
// Run: node --test tests/commission-phases.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'commission-phases-test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Property = require('../models/Property');
const { PropertyType } = require('../models/Category');
const CommissionRecord = require('../models/CommissionRecord');
const Notification = require('../models/Notification');
require('../models/Visit');
require('../models/ContactForm');
require('../models/Conversation');
const saleRoutes = require('../routes/saleRoutes');
const rentalRoutes = require('../routes/rentalRoutes');
const commissionRoutes = require('../routes/commissionRoutes');
const analyticsRoutes = require('../routes/analyticsRoutes');

describe('Two-phase commission payout', () => {
  let mongod;
  let api;
  let admin;
  let agent;
  let saleType;
  let zeroType;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });

  const mkProperty = (over = {}) =>
    Property.create({
      title: `Phase ${Date.now()}-${Math.random().toString(36).slice(2)}`,
      description: 'A property fixture for phase tests.',
      propertyType: saleType._id,
      price: 1000000,
      saleType: 'sale',
      commissionPercentage: 4, // 4% of 1,000,000 = 40,000
      location: { province: 'Bagmati', district: 'Kathmandu' },
      listedBy: admin._id,
      ...over,
    });

  const mkLead = (propertyId, over = {}) =>
    Lead.create({
      name: 'Phase Case',
      email: `phase-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
      stage: 'negotiation',
      property: propertyId,
      assignedAgent: agent._id,
      ...over,
    });

  const fileAndVerifySale = async (agreedPrice, verifyBody, propertyOver) => {
    const property = await mkProperty(propertyOver);
    const lead = await mkLead(property._id);
    const filed = await request(api).post('/api/sales').set(auth(agent)).send({
      leadId: String(lead._id),
      buyer: { name: 'Phase Buyer' },
      agreedPrice,
      paymentType: 'full_payment',
    });
    assert.equal(filed.status, 201);
    const verified = await request(api)
      .patch(`/api/sales/${filed.body.sale._id}/verify`)
      .set(auth(admin))
      .send(verifyBody || {});
    return { property, lead, saleId: filed.body.sale._id, verified };
  };

  const fileAndVerifyRental = async (commissionAmount, firstPhaseAmount) => {
    const property = await mkProperty({ saleType: 'rent', commissionPercentage: undefined });
    const lead = await mkLead(property._id);
    const filed = await request(api).post('/api/rentals').set(auth(agent)).send({
      leadId: String(lead._id),
      tenant: { name: 'Phase Tenant' },
      monthlyRent: 20000,
      durationInMonths: 12,
      startDate: new Date().toISOString(),
    });
    assert.equal(filed.status, 201);
    const body = { commissionAmount };
    if (firstPhaseAmount !== undefined) body.firstPhaseAmount = firstPhaseAmount;
    const verified = await request(api)
      .patch(`/api/rentals/${filed.body.rental._id}/verify`)
      .set(auth(admin))
      .send(body);
    return { property, lead, rentalId: filed.body.rental._id, verified };
  };

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    app.use('/api/sales', saleRoutes);
    app.use('/api/rentals', rentalRoutes);
    app.use('/api/commissions', commissionRoutes);
    app.use('/api/analytics', analyticsRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, agent] = await Promise.all([
      User.create({ name: 'PH Admin', email: 'ph-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'PH Agent', email: 'ph-agent@test.com', password: 'password1', role: 'agent' }),
    ]);
    [saleType, zeroType] = await Promise.all([
      PropertyType.create({ name: 'PH House', category: 'building', defaultCommissionPercentage: 2 }),
      PropertyType.create({ name: 'PH Zero', category: 'building' }),
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('sale verify creates a default 50/50 split in pending status', async () => {
    const { verified } = await fileAndVerifySale(1000000);
    assert.equal(verified.status, 200);
    assert.equal(verified.body.commission.amount, 40000);
    assert.equal(verified.body.commission.phase1Amount, 20000);
    assert.equal(verified.body.commission.phase2Amount, 20000);
    assert.equal(verified.body.commission.payoutStatus, 'pending');

    const record = await CommissionRecord.findOne({ sale: verified.body.sale._id });
    assert.ok(record);
    assert.equal(record.phase1Amount, 20000);
    assert.equal(record.phase2Amount, 20000);
    assert.equal(record.payoutStatus, 'pending');
    assert.equal(record.phase1Paid, false);
    assert.equal(record.phase2Paid, false);
    assert.equal(record.isPaid, false);
    assert.equal(record.paidAt, null);
  });

  it('rental verify creates a default 50/50 split in pending status', async () => {
    const { verified } = await fileAndVerifyRental(24000);
    assert.equal(verified.status, 200);
    assert.equal(verified.body.commission.amount, 24000);
    assert.equal(verified.body.commission.phase1Amount, 12000);
    assert.equal(verified.body.commission.phase2Amount, 12000);
    assert.equal(verified.body.commission.payoutStatus, 'pending');
  });

  it('accepts a custom first-phase amount on sale and rental verify', async () => {
    const sale = await fileAndVerifySale(1000000, { firstPhaseAmount: 10000 });
    assert.equal(sale.verified.status, 200);
    assert.equal(sale.verified.body.commission.phase1Amount, 10000);
    assert.equal(sale.verified.body.commission.phase2Amount, 30000);

    const rental = await fileAndVerifyRental(24000, 5000);
    assert.equal(rental.verified.status, 200);
    assert.equal(rental.verified.body.commission.phase1Amount, 5000);
    assert.equal(rental.verified.body.commission.phase2Amount, 19000);
  });

  it('preserves the exact total after rounding', async () => {
    const { verified } = await fileAndVerifySale(1000000, { firstPhaseAmount: 13333.33 });
    assert.equal(verified.status, 200);
    const { phase1Amount, phase2Amount, amount } = verified.body.commission;
    assert.ok(Math.abs(phase1Amount + phase2Amount - amount) <= 0.01);
    assert.equal(phase2Amount, Math.round((amount - phase1Amount) * 100) / 100);
  });

  it('rejects invalid first-phase amounts without creating a commission', async () => {
    for (const bad of [-5, 99999999, 'not-a-number']) {
      const property = await mkProperty();
      const lead = await mkLead(property._id);
      const filed = await request(api).post('/api/sales').set(auth(agent)).send({
        leadId: String(lead._id),
        buyer: { name: 'Bad Split Buyer' },
        agreedPrice: 1000000,
        paymentType: 'full_payment',
      });
      assert.equal(filed.status, 201);
      const verified = await request(api)
        .patch(`/api/sales/${filed.body.sale._id}/verify`)
        .set(auth(admin))
        .send({ firstPhaseAmount: bad });
      assert.equal(verified.status, 400, `firstPhaseAmount=${bad}`);
      assert.equal(await CommissionRecord.countDocuments({ sale: filed.body.sale._id }), 0);
      assert.match(verified.body.message, /firstPhaseAmount/);
    }
  });

  it('enforces ordering, double-pay protection and status transitions', async () => {
    const { verified } = await fileAndVerifySale(1000000);
    const recordId = (await CommissionRecord.findOne({ sale: verified.body.sale._id }))._id;

    // Phase 2 before phase 1 -> 400
    const early = await request(api).patch(`/api/commissions/${recordId}/pay-phase-2`).set(auth(admin)).send({ note: 'too early' });
    assert.equal(early.status, 400);
    assert.match(early.body.message, /Phase 1 must be paid/);

    // Pay phase 1 -> partial
    const p1 = await request(api).patch(`/api/commissions/${recordId}/pay-phase-1`).set(auth(admin)).send({ note: 'first half cash' });
    assert.equal(p1.status, 200);
    assert.equal(p1.body.commission.payoutStatus, 'partial');
    assert.equal(p1.body.commission.phase1Paid, true);
    assert.ok(p1.body.commission.phase1PaidAt);
    assert.equal(p1.body.commission.phase1Note, 'first half cash');
    assert.equal(p1.body.commission.isPaid, false);
    assert.equal(p1.body.commission.paidAt, null);

    // Phase 1 double-pay -> 400
    const p1again = await request(api).patch(`/api/commissions/${recordId}/pay-phase-1`).set(auth(admin)).send({});
    assert.equal(p1again.status, 400);

    // Pay phase 2 -> fully paid, isPaid synced, paidAt === phase2PaidAt
    const p2 = await request(api).patch(`/api/commissions/${recordId}/pay-phase-2`).set(auth(admin)).send({ note: 'final transfer' });
    assert.equal(p2.status, 200);
    assert.equal(p2.body.commission.payoutStatus, 'paid');
    assert.equal(p2.body.commission.isPaid, true);
    assert.equal(new Date(p2.body.commission.paidAt).getTime(), new Date(p2.body.commission.phase2PaidAt).getTime());

    // Phase 2 double-pay -> 400
    const p2again = await request(api).patch(`/api/commissions/${recordId}/pay-phase-2`).set(auth(admin)).send({});
    assert.equal(p2again.status, 400);

    // 404 for unknown ids
    const missing = await request(api)
      .patch(`/api/commissions/${new mongoose.Types.ObjectId()}/pay-phase-1`)
      .set(auth(admin))
      .send({});
    assert.equal(missing.status, 404);
  });

  it('notifies the agent on each phase (phase1 type, final type)', async () => {
    const { verified } = await fileAndVerifySale(1000000);
    const record = await CommissionRecord.findOne({ sale: verified.body.sale._id });
    await request(api).patch(`/api/commissions/${record._id}/pay-phase-1`).set(auth(admin)).send({});
    await request(api).patch(`/api/commissions/${record._id}/pay-phase-2`).set(auth(admin)).send({});
    const types = (await Notification.find({ commissionRecord: record._id }).select('type')).map((n) => n.type);
    assert.ok(types.includes('commission_phase1_paid'), `types=${types.join(',')}`);
    assert.ok(types.includes('commission_paid'), `types=${types.join(',')}`);
  });

  it('treats zero-total commissions as fully paid with no payout clicks', async () => {
    // Sale with 0% everywhere (no property override, type has no default) -> total 0
    const zeroSale = await fileAndVerifySale(1000000, {}, { propertyType: zeroType._id, commissionPercentage: null });
    assert.equal(zeroSale.verified.status, 200);
    assert.equal(zeroSale.verified.body.commission.amount, 0);
    assert.equal(zeroSale.verified.body.commission.payoutStatus, 'paid');
    const record = await CommissionRecord.findOne({ sale: zeroSale.saleId });
    assert.equal(record.payoutStatus, 'paid');
    assert.equal(record.isPaid, true);
    assert.ok(record.paidAt);

    // Rental with explicit 0 commission
    const rental = await fileAndVerifyRental(0);
    assert.equal(rental.verified.status, 200);
    assert.equal(rental.verified.body.commission.payoutStatus, 'paid');
  });

  it('keeps mark-paid as a deprecated alias that settles remaining phases in order', async () => {
    const { verified } = await fileAndVerifySale(1000000);
    const recordId = (await CommissionRecord.findOne({ sale: verified.body.sale._id }))._id;

    const full = await request(api).patch(`/api/commissions/${recordId}/mark-paid`).set(auth(admin)).send({ paidNote: 'legacy settle' });
    assert.equal(full.status, 200);
    assert.equal(full.body.commission.payoutStatus, 'paid');
    assert.equal(full.body.commission.phase1Paid, true);
    assert.equal(full.body.commission.phase2Paid, true);
    assert.ok(full.headers.deprecation, 'missing Deprecation header');
    assert.ok(full.body.deprecationWarning, 'missing deprecationWarning');

    // Already paid -> 400 (legacy behavior preserved)
    const again = await request(api).patch(`/api/commissions/${recordId}/mark-paid`).set(auth(admin)).send({});
    assert.equal(again.status, 400);

    // Partial record via alias settles only the remainder
    const second = await fileAndVerifySale(1000000);
    const secondId = (await CommissionRecord.findOne({ sale: second.saleId }))._id;
    await request(api).patch(`/api/commissions/${secondId}/pay-phase-1`).set(auth(admin)).send({ note: 'p1' });
    const remainder = await request(api).patch(`/api/commissions/${secondId}/mark-paid`).set(auth(admin)).send({ paidNote: 'rest' });
    assert.equal(remainder.status, 200);
    assert.equal(remainder.body.commission.payoutStatus, 'paid');
    assert.equal(remainder.body.commission.phase1Note, 'p1');
  });

  it('restricts payouts to admins and scopes reads to the filing agent', async () => {
    const { verified } = await fileAndVerifySale(1000000);
    const recordId = (await CommissionRecord.findOne({ sale: verified.body.sale._id }))._id;
    assert.equal(
      (await request(api).patch(`/api/commissions/${recordId}/pay-phase-1`).set(auth(agent)).send({})).status,
      403
    );
    const other = await User.create({ name: 'PH Other', email: `ph-other-${Date.now()}@test.com`, password: 'password1', role: 'agent' });
    const otherList = await request(api).get('/api/commissions').set(auth(other));
    assert.equal(otherList.status, 200);
    assert.ok(!(otherList.body.commissions || []).some((c) => String(c._id) === String(recordId)));
  });

  it('backfills legacy-shaped records deterministically and idempotently', async () => {
    const property = await mkProperty();
    // Raw insert bypassing the model hook: the exact pre-feature document shape.
    const legacyUnpaid = await CommissionRecord.collection.insertOne({
      sale: new mongoose.Types.ObjectId(),
      rental: null,
      property: property._id,
      agent: agent._id,
      transactionAmount: 950000,
      commissionPercentage: 3,
      commissionAmount: 28500,
      isPaid: false,
      paidAt: null,
      paidNote: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const legacyPaidAt = new Date('2025-01-15T00:00:00.000Z');
    const legacyPaid = await CommissionRecord.collection.insertOne({
      sale: new mongoose.Types.ObjectId(),
      property: property._id,
      agent: agent._id,
      transactionAmount: 240000,
      commissionPercentage: 5,
      commissionAmount: 12000,
      isPaid: true,
      paidAt: legacyPaidAt,
      paidNote: 'cash',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const runBackfillOnce = async (doc) => {
      const loaded = await CommissionRecord.findById(doc.insertedId);
      await loaded.save(); // model hook derives the split like the script
      return loaded;
    };

    const unpaid = await runBackfillOnce(legacyUnpaid);
    assert.equal(unpaid.phase1Amount, 14250);
    assert.equal(unpaid.phase2Amount, 14250);
    assert.equal(unpaid.payoutStatus, 'pending');
    assert.equal(unpaid.isPaid, false);

    const paid = await runBackfillOnce(legacyPaid);
    assert.equal(paid.phase1Amount, 6000);
    assert.equal(paid.phase2Amount, 6000);
    assert.equal(paid.payoutStatus, 'paid');
    assert.equal(paid.phase1Paid, true);
    assert.equal(paid.phase2Paid, true);
    assert.equal(new Date(paid.paidAt).getTime(), legacyPaidAt.getTime());

    // Idempotence: second save changes nothing (same amounts, same status).
    const snapshot = unpaid.toObject();
    await unpaid.save();
    const reloaded = await CommissionRecord.findById(unpaid._id);
    assert.equal(reloaded.phase1Amount, snapshot.phase1Amount);
    assert.equal(reloaded.phase2Amount, snapshot.phase2Amount);
    assert.equal(reloaded.payoutStatus, snapshot.payoutStatus);
  });

  it('reports phase-aware list totals and filters without double counting', async () => {
    const totalsAgent = await User.create({ name: 'PH Totals', email: `ph-totals-${Date.now()}@test.com`, password: 'password1', role: 'agent' });
    const property = await mkProperty();
    const mk = (total, p1paid, p2paid) => {
      const half = Math.round((total / 2) * 100) / 100;
      return CommissionRecord.create({
        property: property._id,
        agent: totalsAgent._id,
        transactionAmount: total * 10,
        commissionPercentage: 10,
        commissionAmount: total,
        phase1Amount: half,
        phase2Amount: Math.round((total - half) * 100) / 100,
        phase1Paid: p1paid,
        phase2Paid: p2paid,
        phase1PaidAt: p1paid ? new Date() : null,
        phase2PaidAt: p2paid ? new Date() : null,
        payoutStatus: p1paid && p2paid ? 'paid' : p1paid ? 'partial' : 'pending',
      });
    };
    await mk(1000, false, false); // pending: 1000 unpaid
    await mk(2000, true, false); // partial: 1000 paid + 1000 remainder
    await mk(4000, true, true); // paid: 4000 paid

    const res = await request(api).get(`/api/commissions?agent=${totalsAgent._id}&limit=50`).set(auth(admin));
    assert.equal(res.status, 200);
    const t = res.body.totals;
    assert.equal(t.totalPaidAmount, 5000); // 1000 (partial p1) + 4000 (paid)
    assert.equal(t.pendingAmount, 2000); // 1000 (pending) + 1000 (partial remainder)
    assert.equal(t.partialAmount, 1000);
    assert.equal(t.paidCount, 1);
    assert.equal(t.pendingCount, 1);
    assert.equal(t.partialCount, 1);
    // No double counting: paid + pending == earned total.
    assert.equal(t.totalPaidAmount + t.pendingAmount, 7000);

    const partialOnly = await request(api)
      .get(`/api/commissions?agent=${totalsAgent._id}&payoutStatus=partial`)
      .set(auth(admin));
    assert.equal(partialOnly.body.commissions.length, 1);
    assert.equal(partialOnly.body.commissions[0].payoutStatus, 'partial');

    // Legacy flag: false still returns every not-fully-paid record.
    const legacyUnpaid = await request(api)
      .get(`/api/commissions?agent=${totalsAgent._id}&isPaid=false&limit=50`)
      .set(auth(admin));
    assert.equal(legacyUnpaid.body.commissions.length, 2);

    const bad = await request(api).get('/api/commissions?payoutStatus=bogus').set(auth(admin));
    assert.equal(bad.status, 400);
  });

  it('reports phase-aware summary totals', async () => {
    const sumAgent = await User.create({ name: 'PH Sum', email: `ph-sum-${Date.now()}@test.com`, password: 'password1', role: 'agent' });
    const property = await mkProperty();
    const half = (n) => Math.round((n / 2) * 100) / 100;
    await CommissionRecord.create({
      property: property._id, agent: sumAgent._id, transactionAmount: 10000,
      commissionPercentage: 10, commissionAmount: 1000,
      phase1Amount: half(1000), phase2Amount: 1000 - half(1000),
      payoutStatus: 'pending',
    });
    const partialDoc = await CommissionRecord.create({
      property: property._id, agent: sumAgent._id, transactionAmount: 20000,
      commissionPercentage: 10, commissionAmount: 2000,
      phase1Amount: half(2000), phase2Amount: 2000 - half(2000),
      phase1Paid: true, phase1PaidAt: new Date(), payoutStatus: 'partial',
    });
    assert.equal(partialDoc.payoutStatus, 'partial');

    const res = await request(api).get('/api/commissions/summary').set(auth(sumAgent));
    assert.equal(res.status, 200);
    const s = res.body.summary;
    assert.equal(s.pending, 2000); // 1000 + 1000 remainder
    assert.equal(s.partial, 1000);
    assert.equal(s.partialCount, 1);
    assert.equal(s.lifetimePaid, 1000);
  });

  it('records phase payments as individual analytics events with no double counting', async () => {
    const analyticsAgent = await User.create({ name: 'PH Analytics', email: `ph-an-${Date.now()}@test.com`, password: 'password1', role: 'agent' });
    const property = await mkProperty();
    // One partial (1000 paid / 1000 open) + one fully paid (4000).
    await CommissionRecord.create({
      property: property._id, agent: analyticsAgent._id, transactionAmount: 20000,
      commissionPercentage: 10, commissionAmount: 2000,
      phase1Amount: 1000, phase2Amount: 1000,
      phase1Paid: true, phase1PaidAt: new Date(), payoutStatus: 'partial',
    });
    await CommissionRecord.create({
      property: property._id, agent: analyticsAgent._id, transactionAmount: 40000,
      commissionPercentage: 10, commissionAmount: 4000,
      phase1Amount: 2000, phase2Amount: 2000,
      phase1Paid: true, phase1PaidAt: new Date(),
      phase2Paid: true, phase2PaidAt: new Date(), payoutStatus: 'paid',
    });

    const res = await request(api).get('/api/analytics/admin').set(auth(admin));
    assert.equal(res.status, 200);
    const c = res.body.analytics.commissions;
    assert.ok(c.earnedTotal >= 6000);
    assert.ok(c.paidAmount >= 5000);
    // paid + pending === earned (invariant: nothing counted twice, nothing lost)
    assert.equal(
      Math.round((c.paidAmount + c.pendingAmount) * 100) / 100,
      Math.round(c.earnedTotal * 100) / 100
    );
    const paidSeriesTotal = (res.body.analytics.commissionOverTime || [])
      .reduce((sum, row) => sum + Number(row.paid || 0), 0);
    assert.ok(
      paidSeriesTotal >= 5000,
      `commissionOverTime paid series (${paidSeriesTotal}) must include every settled phase`
    );
  });
});
