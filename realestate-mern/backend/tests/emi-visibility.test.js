// Phase 4: EMI financial visibility - admin sees the full breakdown,
// assigned agents keep payment-status-only visibility (no amounts).
// Run: node --test tests/emi-visibility.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'emi-visibility-test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Property = require('../models/Property');
const { PropertyType } = require('../models/Category');
const saleRoutes = require('../routes/saleRoutes');
const emiPlanRoutes = require('../routes/emiPlanRoutes');

describe('EMI financial visibility', () => {
  let mongod;
  let api;
  let admin;
  let agent;
  let buyer;
  let saleType;
  let planId;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });

  const MONEY_KEYS = ['principalAmount', 'installmentAmount', 'totalPaid', 'outstandingBalance', 'serviceChargeAmount'];
  const SALE_MONEY_KEYS = ['agreedPrice', 'downPaymentAmount', 'downPaymentPercent'];

  const assertNoMoney = (plan, label) => {
    for (const k of MONEY_KEYS) {
      assert.ok(!(k in plan), `${label} leaks plan.${k}`);
    }
    for (const k of SALE_MONEY_KEYS) {
      assert.ok(!(plan.sale && k in plan.sale), `${label} leaks sale.${k}`);
    }
    for (const inst of plan.installments || []) {
      assert.ok(!('amount' in inst), `${label} leaks installment.amount`);
      assert.ok(!('paidAmount' in inst), `${label} leaks installment.paidAmount`);
    }
  };

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
      User.create({ name: 'EV Admin', email: 'ev-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'EV Agent', email: 'ev-agent@test.com', password: 'password1', role: 'agent' }),
    ]);
    buyer = await User.create({ name: 'EV Buyer', email: `ev-buyer-${Date.now()}@test.com`, password: 'password1', role: 'user' });
    saleType = await PropertyType.create({ name: 'EV House', category: 'building' });

    const property = await Property.create({
      title: 'EV House', description: 'Visibility fixture.', propertyType: saleType._id,
      price: 5000000, saleType: 'sale',
      location: { province: 'Bagmati', district: 'Kathmandu' }, listedBy: admin._id,
    });
    const lead = await Lead.create({
      name: 'EV Case', email: `ev-${Date.now()}@test.com`, stage: 'negotiation',
      property: property._id, assignedAgent: agent._id,
    });
    const filed = await request(api).post('/api/sales').set(auth(agent)).send({
      leadId: String(lead._id),
      buyer: { name: 'EV Buyer', email: buyer.email },
      agreedPrice: 5000000,
      paymentType: 'emi',
      downPaymentPercent: 20,
    });
    assert.equal(filed.status, 201);
    await request(api).patch(`/api/sales/${filed.body.sale._id}/verify`).set(auth(admin)).send({});
    const init = await request(api).post('/api/emi-plans').set(auth(admin)).send({
      saleId: filed.body.sale._id,
      principalAmount: 4050000,
      tenureMonths: 9,
      installmentAmount: 450000,
      startDate: new Date().toISOString(),
      serviceChargeAmount: 50000,
    });
    assert.ok([200, 201].includes(init.status), JSON.stringify(init.body).slice(0, 200));
    planId = init.body.plan._id;
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('admin sees the full financial breakdown', async () => {
    const res = await request(api).get(`/api/emi-plans/${planId}`).set(auth(admin));
    assert.equal(res.status, 200);
    assert.equal(res.body.plan.serviceChargeAmount, 50000);
    assert.equal(res.body.plan.principalAmount, 4050000);
    assert.ok(res.body.plan.installments[0].amount > 0);
    assert.equal(res.body.canManage, true);
  });

  it('assigned agent sees statuses only - no amounts anywhere', async () => {
    const res = await request(api).get(`/api/emi-plans/${planId}`).set(auth(agent));
    assert.equal(res.status, 200);
    assertNoMoney(res.body.plan, 'agent-detail');
    // Payment-status tracking preserved.
    assert.ok(Array.isArray(res.body.plan.installments));
    assert.equal(res.body.plan.installments.length, 9);
    assert.ok('status' in res.body.plan.installments[0]);
    assert.ok('verification' in res.body.plan.installments[0]);
    assert.equal(res.body.canManage, false);
  });

  it('agent list responses are equally sanitized', async () => {
    const res = await request(api).get('/api/emi-plans').set(auth(agent));
    assert.equal(res.status, 200);
    assert.ok((res.body.plans || []).length >= 1);
    for (const plan of res.body.plans) {
      assertNoMoney(plan, 'agent-list');
    }
  });

  it('buyer experience unchanged (schedule with amounts, read-only)', async () => {
    const res = await request(api).get(`/api/emi-plans/${planId}`).set(auth(buyer));
    assert.equal(res.status, 200);
    assert.ok(res.body.plan.installments[0].amount > 0);
    assert.equal(res.body.canManage, false);
  });
});
