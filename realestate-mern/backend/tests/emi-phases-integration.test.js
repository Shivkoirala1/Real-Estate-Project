// Phase 2: percent-based EMI filing + service-charge plan init (backend).
// Run: node --test tests/emi-phases-integration.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'emi-phases-integration-test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Property = require('../models/Property');
const Sale = require('../models/Sale');
const EMIPlan = require('../models/EMIPlan');
const { PropertyType } = require('../models/Category');
const saleRoutes = require('../routes/saleRoutes');
const emiPlanRoutes = require('../routes/emiPlanRoutes');

describe('EMI percent filing + service-charge init', () => {
  let mongod;
  let api;
  let admin;
  let agent;
  let buyer;
  let saleType;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });

  let seq = 0;
  const mkProperty = () => {
    seq += 1;
    return Property.create({
      title: `EMI Phase House ${seq}`,
      description: 'A property fixture for EMI phase tests.',
      propertyType: saleType._id,
      price: 5000000,
      saleType: 'sale',
      location: { province: 'Bagmati', district: 'Kathmandu' },
      listedBy: admin._id,
    });
  };
  const mkLead = (propertyId) => {
    seq += 1;
    return Lead.create({
      name: `EMI Case ${seq}`,
      email: `emi-phase-${Date.now()}-${seq}@test.com`,
      stage: 'negotiation',
      property: propertyId,
      assignedAgent: agent._id,
    });
  };
  const fileSale = (leadId, body) =>
    request(api).post('/api/sales').set(auth(agent)).send({
      leadId: String(leadId),
      buyer: { name: 'EMI Buyer', email: buyer.email },
      agreedPrice: 5000000,
      paymentType: 'emi',
      ...body,
    });
  const fileAndVerifyEmiSale = async (body) => {
    const property = await mkProperty();
    const lead = await mkLead(property._id);
    const filed = await fileSale(lead._id, body);
    assert.equal(filed.status, 201, JSON.stringify(filed.body).slice(0, 200));
    const verified = await request(api).patch(`/api/sales/${filed.body.sale._id}/verify`).set(auth(admin)).send({});
    assert.equal(verified.status, 200);
    return Sale.findById(filed.body.sale._id);
  };
  const initPlan = (sale, over = {}) =>
    request(api).post('/api/emi-plans').set(auth(admin)).send({
      saleId: String(sale._id),
      principalAmount: over.principalAmount,
      tenureMonths: 10,
      installmentAmount: over.installmentAmount,
      startDate: new Date().toISOString(),
      ...over.extra,
    });

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    app.use('/api/sales', saleRoutes);
    app.use('/api/emi-plans', emiPlanRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, agent] = await Promise.all([
      User.create({ name: 'EP Admin', email: 'ep-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'EP Agent', email: 'ep-agent@test.com', password: 'password1', role: 'agent' }),
    ]);
    buyer = await User.create({ name: 'EP Buyer', email: `ep-buyer-${Date.now()}@test.com`, password: 'password1', role: 'user' });
    saleType = await PropertyType.create({ name: 'EP House', category: 'building' });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('20% of NPR 5,000,000 stores NPR 1,000,000 + percent 20', async () => {
    const sale = await fileAndVerifyEmiSale({ downPaymentPercent: 20 });
    assert.equal(sale.downPaymentAmount, 1000000);
    assert.equal(sale.downPaymentPercent, 20);
  });

  it('60% boundary accepted, 60.01% / 100% / 9.99% rejected', async () => {
    const ok = await fileAndVerifyEmiSale({ downPaymentPercent: 60 });
    assert.equal(ok.downPaymentAmount, 3000000);

    for (const bad of [60.01, 100, 9.99]) {
      const property = await mkProperty();
      const lead = await mkLead(property._id);
      const res = await fileSale(lead._id, { downPaymentPercent: bad });
      assert.equal(res.status, 400, `pct=${bad}`);
      assert.match(res.body.message, /percent/i);
    }
  });

  it('EMI filing without a percent is rejected (no amount-only path)', async () => {
    for (const body of [{}, { downPaymentAmount: 750000 }]) {
      const property = await mkProperty();
      const lead = await mkLead(property._id);
      const res = await fileSale(lead._id, body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.match(res.body.message, /percent/i);
    }
  });

  it('a directly supplied amount cannot override the percent', async () => {
    const property = await mkProperty();
    const lead = await mkLead(property._id);
    // Even a "matching" amount is rejected - percent is the only input.
    const res = await fileSale(lead._id, { downPaymentPercent: 20, downPaymentAmount: 1000000 });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /cannot be supplied directly/);
  });

  it('percent ignored for non-EMI (null stored)', async () => {
    const property = await mkProperty();
    const lead = await mkLead(property._id);
    const full = await request(api).post('/api/sales').set(auth(agent)).send({
      leadId: String(lead._id),
      buyer: { name: 'Cash Buyer' },
      agreedPrice: 5000000,
      paymentType: 'full_payment',
      downPaymentPercent: 20,
    });
    assert.equal(full.status, 201);
    assert.equal((await Sale.findById(full.body.sale._id)).downPaymentPercent, null);
  });

  it('charge 0 preserves the legacy principal equality', async () => {
    const sale = await fileAndVerifyEmiSale({ downPaymentPercent: 20 });
    const res = await initPlan(sale, { principalAmount: 4000000, installmentAmount: 400000 });
    assert.ok([200, 201].includes(res.status), JSON.stringify(res.body).slice(0, 200));
    assert.equal(res.body.plan.serviceChargeAmount, 0);
    assert.equal(res.body.plan.principalAmount, 4000000);
  });

  it('charge 50,000 merges into principal; schedule equals principal', async () => {
    const sale = await fileAndVerifyEmiSale({ downPaymentPercent: 20 });
    const res = await initPlan(sale, { principalAmount: 4050000, installmentAmount: 405000, extra: { serviceChargeAmount: 50000 } });
    assert.ok([200, 201].includes(res.status), JSON.stringify(res.body).slice(0, 200));
    assert.equal(res.body.plan.serviceChargeAmount, 50000);
    const total = res.body.plan.installments.reduce((s, i) => s + i.amount, 0);
    assert.equal(Math.round(total * 100) / 100, 4050000);
  });

  it('stale principal and bad charges rejected', async () => {
    const sale = await fileAndVerifyEmiSale({ downPaymentPercent: 20 });
    // Old principal (ignoring the charge) no longer validates.
    const stale = await initPlan(sale, { principalAmount: 4000000, installmentAmount: 400000, extra: { serviceChargeAmount: 50000 } });
    assert.equal(stale.status, 400);
    assert.match(stale.body.message, /Principal must equal/);

    for (const bad of [-1, 'abc']) {
      const sale2 = await fileAndVerifyEmiSale({ downPaymentPercent: 20 });
      const res = await initPlan(sale2, { principalAmount: 4000000, installmentAmount: 400000, extra: { serviceChargeAmount: bad } });
      assert.equal(res.status, 400, `charge=${bad}`);
    }
  });

  it('post-init service-charge modification → 400; old docs default to 0', async () => {
    const sale = await fileAndVerifyEmiSale({ downPaymentPercent: 20 });
    const created = await initPlan(sale, { principalAmount: 4000000, installmentAmount: 400000 });
    const planId = created.body.plan._id;

    const mod = await request(api).patch(`/api/emi-plans/${planId}`).set(auth(admin)).send({ serviceChargeAmount: 1000 });
    assert.equal(mod.status, 400);
    assert.match(mod.body.message, /frozen|changed after/i);

    // Legacy-shaped plan documents behave as charge 0.
    await EMIPlan.updateOne({ _id: planId }, { $unset: { serviceChargeAmount: 1 } });
    const reloaded = await EMIPlan.findById(planId);
    assert.equal(reloaded.serviceChargeAmount, 0);
  });
});
