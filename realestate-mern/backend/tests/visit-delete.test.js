// Phase 1 visit deletion: cancelled-only, admin or assigned-agent only,
// block-when-linked, audit snapshot, notification history preserved.
// Run: node --test tests/visit-delete.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'visit-delete-test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Property = require('../models/Property');
const Visit = require('../models/Visit');
const Notification = require('../models/Notification');
const VisitDeletionLog = require('../models/VisitDeletionLog');
const { PropertyType } = require('../models/Category');
require('../models/ContactForm');
require('../models/Conversation');
const visitRoutes = require('../routes/visitRoutes');

describe('Phase 1 visit deletion', () => {
  let mongod;
  let api;
  let admin;
  let agent;
  let otherAgent;
  let buyer;
  let property;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });

  let seq = 0;
  const mkVisit = (over = {}) => {
    seq += 1;
    return Visit.create({
      visitType: 'property',
      property: property._id,
      requestedBy: buyer._id,
      assignedAgent: agent._id,
      requestedSlot: new Date(Date.now() + 86400000 * seq),
      status: 'cancelled',
      ...over,
    });
  };

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    app.use('/api/visits', visitRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, agent, otherAgent, buyer] = await Promise.all([
      User.create({ name: 'VD Admin', email: 'vd-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'VD Agent', email: 'vd-agent@test.com', password: 'password1', role: 'agent' }),
      User.create({ name: 'VD Other', email: 'vd-other@test.com', password: 'password1', role: 'agent' }),
      User.create({ name: 'VD Buyer', email: 'vd-buyer@test.com', password: 'password1', role: 'user' }),
    ]);
    const ptype = await PropertyType.create({ name: 'VD House', category: 'building' });
    property = await Property.create({
      title: 'VD Property',
      description: 'A property fixture for visit delete tests.',
      propertyType: ptype._id,
      price: 5000000,
      saleType: 'sale',
      location: { province: 'Bagmati', district: 'Kathmandu' },
      listedBy: admin._id,
    });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('admin deletes an unlinked cancelled visit + persists a full audit snapshot', async () => {
    const visit = await mkVisit();
    const note = await Notification.create({
      recipient: admin._id,
      type: 'visit_cancelled',
      title: 'Visit cancelled',
      message: 'history must survive',
      visit: visit._id,
      property: property._id,
      link: '/dashboard/admin/visits',
    });

    const res = await request(api).delete(`/api/visits/${visit._id}`).set(auth(admin));
    assert.equal(res.status, 200);
    assert.equal(await Visit.countDocuments({ _id: visit._id }), 0);

    const log = await VisitDeletionLog.findOne({ visit: visit._id });
    assert.ok(log, 'audit snapshot missing');
    assert.equal(log.status, 'cancelled');
    assert.equal(log.visitType, 'property');
    assert.ok(log.requestedSlot instanceof Date);
    assert.equal(String(log.assignedAgent), String(agent._id));
    assert.equal(String(log.requestedBy), String(buyer._id));
    assert.equal(String(log.property), String(property._id));
    assert.equal(log.convertedLead, null);
    assert.equal(log.linkedLead, null);
    assert.equal(String(log.deletedBy), String(admin._id));
    assert.ok(log.deletedAt instanceof Date);

    // Notification history preserved, lead untouched (none existed).
    assert.equal(await Notification.countDocuments({ _id: note._id }), 1);
  });

  it('assigned agent deletes their own unlinked cancelled visit', async () => {
    const visit = await mkVisit();
    const res = await request(api).delete(`/api/visits/${visit._id}`).set(auth(agent));
    assert.equal(res.status, 200);
    assert.equal(await Visit.countDocuments({ _id: visit._id }), 0);
    const log = await VisitDeletionLog.findOne({ visit: visit._id });
    assert.ok(log);
    assert.equal(String(log.deletedBy), String(agent._id));
  });

  it('rejects unassigned agent (403), buyer (403) and unknown id (404)', async () => {
    const visit = await mkVisit();
    assert.equal((await request(api).delete(`/api/visits/${visit._id}`).set(auth(otherAgent))).status, 403);
    assert.equal((await request(api).delete(`/api/visits/${visit._id}`).set(auth(buyer))).status, 403);
    assert.equal(
      (await request(api).delete(`/api/visits/${new mongoose.Types.ObjectId()}`).set(auth(admin))).status,
      404
    );
    // Nothing deleted by the rejected attempts.
    assert.equal(await Visit.countDocuments({ _id: visit._id }), 1);
    assert.equal(await VisitDeletionLog.countDocuments({ visit: visit._id }), 0);
  });

  it('rejects every non-cancelled status (409) without side effects', async () => {
    for (const status of ['pending_agent_review', 'confirmed', 'completed', 'rejected']) {
      const visit = await mkVisit({ status });
      for (const user of [admin, agent]) {
        const res = await request(api).delete(`/api/visits/${visit._id}`).set(auth(user));
        assert.equal(res.status, 409, `${status} by ${user.role}`);
        assert.match(res.body.message, /Only cancelled visits/);
      }
      assert.equal(await Visit.countDocuments({ _id: visit._id }), 1);
      assert.equal(await VisitDeletionLog.countDocuments({ visit: visit._id }), 0);
    }
  });

  it('rejects linked visits (409): convertedLead side and Lead.visit side', async () => {
    const leadA = await Lead.create({
      name: 'Linked A', email: `linked-a-${Date.now()}@test.com`, stage: 'lost', assignedAgent: agent._id,
    });
    const viaConverted = await mkVisit({ convertedLead: leadA._id });
    const blockedA = await request(api).delete(`/api/visits/${viaConverted._id}`).set(auth(admin));
    assert.equal(blockedA.status, 409);
    assert.match(blockedA.body.message, /linked to a lead/);

    const viaLeadRef = await mkVisit();
    const leadB = await Lead.create({
      name: 'Linked B', email: `linked-b-${Date.now()}@test.com`, stage: 'lost',
      assignedAgent: agent._id, visit: viaLeadRef._id,
    });
    const blockedB = await request(api).delete(`/api/visits/${viaLeadRef._id}`).set(auth(admin));
    assert.equal(blockedB.status, 409);

    // No unlink, no cascade, no snapshot on rejection.
    assert.equal(await Visit.countDocuments({ _id: viaConverted._id }), 1);
    assert.equal(await Visit.countDocuments({ _id: viaLeadRef._id }), 1);
    assert.equal((await Lead.findById(leadB._id)).visit.toString(), viaLeadRef._id.toString());
    assert.equal(await VisitDeletionLog.countDocuments({ visit: viaLeadRef._id }), 0);
  });
});
