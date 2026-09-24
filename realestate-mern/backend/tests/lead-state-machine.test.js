// Lead pipeline state machine — transition matrix, freeze rules, lost-note
// requirement, verification/rejection integration and mutation freeze.
// Run: node --test tests/lead-state-machine.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'lead-state-machine-test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Property = require('../models/Property');
const { PropertyType } = require('../models/Category');
const CommissionRecord = require('../models/CommissionRecord');
// Registered for LEAD_POPULATE (visit/contactForm/user) - the mounted
// routes alone don't pull these in, unlike the full server.
require('../models/Visit');
require('../models/ContactForm');
require('../models/Conversation');
const leadRoutes = require('../routes/leadRoutes');
const saleRoutes = require('../routes/saleRoutes');
const rentalRoutes = require('../routes/rentalRoutes');

describe('Lead pipeline state machine', () => {
  let mongod;
  let api;
  let admin;
  let agent;
  let otherAgent;
  let saleType;
  let rentType;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });
  const move = (user, id, stage, note) =>
    request(api).patch(`/api/leads/${id}/stage`).set(auth(user)).send(note === undefined ? { stage } : { stage, note });

  const mkProperty = (saleTypeValue, tag) =>
    Property.create({
      title: `State machine ${tag}`,
      description: 'A property fixture for pipeline tests.',
      propertyType: (saleTypeValue === 'rent' ? rentType : saleType)._id,
      price: 5000000,
      saleType: saleTypeValue,
      location: { province: 'Bagmati', district: 'Kathmandu' },
      listedBy: admin._id,
    });

  const mkLead = (over = {}) =>
    Lead.create({
      name: 'Pipeline Case',
      email: `pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
      stage: 'new',
      assignedAgent: agent._id,
      ...over,
    });

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    app.use('/api/leads', leadRoutes);
    app.use('/api/sales', saleRoutes);
    app.use('/api/rentals', rentalRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, agent, otherAgent] = await Promise.all([
      User.create({ name: 'SM Admin', email: 'sm-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'SM Agent', email: 'sm-agent@test.com', password: 'password1', role: 'agent' }),
      User.create({ name: 'SM Other', email: 'sm-other@test.com', password: 'password1', role: 'agent' }),
    ]);
    [saleType, rentType] = await Promise.all([
      PropertyType.create({ name: 'SM House', category: 'building' }),
      PropertyType.create({ name: 'SM Apartment', category: 'building' }),
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('allows valid forward moves incl. the intentional new→negotiation skip', async () => {
    for (const [from, to] of [['new', 'contacted'], ['new', 'site_visit_scheduled'], ['new', 'negotiation'], ['contacted', 'site_visit_scheduled'], ['contacted', 'negotiation'], ['site_visit_scheduled', 'negotiation']]) {
      const lead = await mkLead({ stage: from });
      const res = await move(agent, lead._id, to);
      assert.equal(res.status, 200, `${from}→${to}`);
      assert.equal(res.body.lead.stage, to);
    }
  });

  it('rejects backward moves with 400', async () => {
    for (const [from, to] of [['contacted', 'new'], ['site_visit_scheduled', 'contacted'], ['site_visit_scheduled', 'new'], ['negotiation', 'contacted'], ['negotiation', 'site_visit_scheduled'], ['negotiation', 'new']]) {
      const lead = await mkLead({ stage: from });
      const res = await move(agent, lead._id, to);
      assert.equal(res.status, 400, `${from}→${to}`);
      assert.match(res.body.message, /Invalid transition/);
    }
  });

  it('moves to lost with a reason, rejects without one, preserves manual reopen', async () => {
    const noNote = await mkLead({ stage: 'negotiation' });
    assert.equal((await move(agent, noNote._id, 'lost')).status, 400);
    assert.equal((await move(agent, noNote._id, 'lost', 'short')).status, 400);

    const withNote = await mkLead({ stage: 'negotiation' });
    const ok = await move(agent, withNote._id, 'lost', 'Buyer found another property within budget');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.lead.stage, 'lost');

    const reopened = await move(agent, withNote._id, 'contacted');
    assert.equal(reopened.status, 200);
    assert.equal(reopened.body.lead.stage, 'contacted');

    const manualClosed = await mkLead({ stage: 'closed', closedBy: 'manual', closedAt: new Date() });
    const reopen = await move(admin, manualClosed._id, 'negotiation');
    assert.equal(reopen.status, 200);
    assert.equal(reopen.body.lead.stage, 'negotiation');
    assert.equal(reopen.body.lead.closedAt, null);
  });

  it('keeps agent→closed prohibited while admin may close manually', async () => {
    const forAgent = await mkLead({ stage: 'negotiation' });
    assert.equal((await move(agent, forAgent._id, 'closed')).status, 403);
    const forAdmin = await mkLead({ stage: 'negotiation' });
    const res = await move(admin, forAdmin._id, 'closed');
    assert.equal(res.status, 200);
    assert.equal(res.body.lead.closedBy, 'manual');
  });

  it('freezes pending_verification leads for manual moves (agent + admin)', async () => {
    const lead = await mkLead({ stage: 'pending_verification' });
    for (const [user, to] of [[agent, 'negotiation'], [agent, 'lost', ], [admin, 'negotiation'], [admin, 'contacted']]) {
      const res = await move(user, lead._id, to, to === 'lost' ? 'A sufficiently long loss reason here' : undefined);
      assert.equal(res.status, 403, `${user.role} pv→${to}`);
    }
    const fresh = await Lead.findById(lead._id);
    assert.equal(fresh.stage, 'pending_verification');
  });

  it('freezes verification-closed leads for manual moves and ordinary mutations', async () => {
    const saleClosed = await mkLead({ stage: 'closed', closedBy: 'sale_verified', closedAt: new Date() });
    const rentalClosed = await mkLead({ stage: 'closed', closedBy: 'rental_verified', closedAt: new Date() });

    for (const lead of [saleClosed, rentalClosed]) {
      assert.equal((await move(agent, lead._id, 'negotiation')).status, 403);
      assert.equal((await move(admin, lead._id, 'lost', 'A sufficiently long loss reason here')).status, 403);
      assert.equal((await request(api).patch(`/api/leads/${lead._id}`).set(auth(agent)).send({ phone: '9800000001' })).status, 403);
      assert.equal((await request(api).patch(`/api/leads/${lead._id}/priority`).set(auth(admin)).send({ priority: 'high' })).status, 403);
      assert.equal((await request(api).patch(`/api/leads/${lead._id}/follow-up`).set(auth(admin)).send({ nextFollowUp: new Date(Date.now() + 86400000).toISOString() })).status, 403);
      assert.equal((await request(api).patch(`/api/leads/${lead._id}/follow-up-done`).set(auth(agent)).send({})).status, 403);
      assert.equal((await request(api).patch(`/api/leads/${lead._id}/reassign`).set(auth(admin)).send({ assignedAgent: otherAgent._id })).status, 403);
      // Agent notes blocked; admin note append allowed.
      assert.equal((await request(api).patch(`/api/leads/${lead._id}/notes`).set(auth(agent)).send({ notes: 'Agent note on a frozen lead here' })).status, 403);
      const adminNote = await request(api).patch(`/api/leads/${lead._id}/notes`).set(auth(admin)).send({ notes: 'Admin review context on a frozen lead' });
      assert.equal(adminNote.status, 200);
      // Audit trail stays writable.
      const activity = await request(api).post(`/api/leads/${lead._id}/activities`).set(auth(agent)).send({ message: 'Called buyer to confirm handover done' });
      assert.equal(activity.status, 201);
    }
    const fresh = await Lead.findById(saleClosed._id);
    assert.equal(fresh.stage, 'closed');
    assert.ok(fresh.closedAt, 'closedAt must survive frozen-state attempts');
  });

  it('sale verify closes with closedBy=sale_verified and keeps property/commission consistent', async () => {
    const property = await mkProperty('sale', 'sale-verify');
    const lead = await mkLead({ stage: 'negotiation', property: property._id });
    const filed = await request(api).post('/api/sales').set(auth(agent)).send({
      leadId: String(lead._id),
      buyer: { name: 'Verify Buyer' },
      agreedPrice: 5000000,
      paymentType: 'full_payment',
    });
    assert.equal(filed.status, 201);
    const frozen = await Lead.findById(lead._id);
    assert.equal(frozen.stage, 'pending_verification');
    assert.equal(frozen.preVerificationStage, 'negotiation');

    const verified = await request(api).patch(`/api/sales/${filed.body.sale._id}/verify`).set(auth(admin)).send({});
    assert.equal(verified.status, 200);
    const closed = await Lead.findById(lead._id);
    assert.equal(closed.stage, 'closed');
    assert.equal(closed.closedBy, 'sale_verified');
    assert.equal(closed.preVerificationStage, null);
    assert.equal((await Property.findById(property._id)).status, 'sold');
    assert.equal(await CommissionRecord.countDocuments({ sale: filed.body.sale._id }), 1);

    // The reported bug: verified-closed must not reopen via API.
    assert.equal((await move(agent, lead._id, 'negotiation')).status, 403);
    assert.equal((await move(admin, lead._id, 'lost', 'Trying to reopen a verified deal here')).status, 403);
  });

  it('rejection restores the actual pre-filing stage (sale + rental)', async () => {
    const saleProp = await mkProperty('sale', 'sale-reject');
    const saleLead = await mkLead({ stage: 'contacted', property: saleProp._id });
    const saleFiled = await request(api).post('/api/sales').set(auth(agent)).send({
      leadId: String(saleLead._id),
      buyer: { name: 'Reject Buyer' },
      agreedPrice: 4000000,
      paymentType: 'full_payment',
    });
    assert.equal(saleFiled.status, 201);
    const rejected = await request(api).patch(`/api/sales/${saleFiled.body.sale._id}/reject`).set(auth(admin)).send({ reason: 'Agreed price below the acceptable threshold' });
    assert.equal(rejected.status, 200);
    const restored = await Lead.findById(saleLead._id);
    assert.equal(restored.stage, 'contacted');
    assert.equal(restored.preVerificationStage, null);
    assert.equal((await Property.findById(saleProp._id)).status, 'available');

    const rentProp = await mkProperty('rent', 'rental-reject');
    const rentLead = await mkLead({ stage: 'site_visit_scheduled', property: rentProp._id });
    const rentFiled = await request(api).post('/api/rentals').set(auth(agent)).send({
      leadId: String(rentLead._id),
      tenant: { name: 'Reject Tenant' },
      monthlyRent: 25000,
      startDate: new Date().toISOString(),
    });
    assert.equal(rentFiled.status, 201);
    const rentRejected = await request(api).patch(`/api/rentals/${rentFiled.body.rental._id}/reject`).set(auth(admin)).send({ reason: 'Tenant references did not check out properly' });
    assert.equal(rentRejected.status, 200);
    const rentRestored = await Lead.findById(rentLead._id);
    assert.equal(rentRestored.stage, 'site_visit_scheduled');

    // Rental verify path sets closedBy=rental_verified and freezes.
    const rentProp2 = await mkProperty('rent', 'rental-verify');
    const rentLead2 = await mkLead({ stage: 'negotiation', property: rentProp2._id });
    const rentFiled2 = await request(api).post('/api/rentals').set(auth(agent)).send({
      leadId: String(rentLead2._id),
      tenant: { name: 'Verify Tenant' },
      monthlyRent: 30000,
      startDate: new Date().toISOString(),
    });
    assert.equal(rentFiled2.status, 201);
    const rentVerified = await request(api).patch(`/api/rentals/${rentFiled2.body.rental._id}/verify`).set(auth(admin)).send({ commissionAmount: 30000 });
    assert.equal(rentVerified.status, 200);
    const rentClosed = await Lead.findById(rentLead2._id);
    assert.equal(rentClosed.stage, 'closed');
    assert.equal(rentClosed.closedBy, 'rental_verified');
    assert.equal((await Property.findById(rentProp2._id)).status, 'rented');
    assert.equal((await move(agent, rentLead2._id, 'negotiation')).status, 403);
  });
});
