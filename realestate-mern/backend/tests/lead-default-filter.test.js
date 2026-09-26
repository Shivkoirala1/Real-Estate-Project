// Default lead list hides terminal stages (closed + lost); explicit lookups
// and global counts are preserved.
// Run: node --test tests/lead-default-filter.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'lead-default-filter-test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const Lead = require('../models/Lead');
require('../models/Visit');
require('../models/ContactForm');
require('../models/Conversation');
const leadRoutes = require('../routes/leadRoutes');

describe('Lead default list hides closed + lost', () => {
  let mongod;
  let api;
  let admin;
  let agent;
  let otherAgent;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });

  let seq = 0;
  const mkLead = (over = {}) => {
    seq += 1;
    return Lead.create({
      name: `Filter Case ${seq}`,
      email: `filter-${Date.now()}-${seq}@test.com`,
      stage: 'new',
      assignedAgent: agent._id,
      ...over,
    });
  };

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    app.use('/api/leads', leadRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, agent, otherAgent] = await Promise.all([
      User.create({ name: 'LF Admin', email: 'lf-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'LF Agent', email: 'lf-agent@test.com', password: 'password1', role: 'agent' }),
      User.create({ name: 'LF Other', email: 'lf-other@test.com', password: 'password1', role: 'agent' }),
    ]);

    await Promise.all([
      mkLead({ stage: 'new' }),
      mkLead({ stage: 'negotiation' }),
      mkLead({ stage: 'closed', closedAt: new Date() }),
      mkLead({ stage: 'lost' }),
      mkLead({ stage: 'closed', closedAt: new Date(), assignedAgent: otherAgent._id }),
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('GET /api/leads defaults to the open pipeline (closed + lost hidden)', async () => {
    const res = await request(api).get('/api/leads?limit=50').set(auth(admin));
    assert.equal(res.status, 200);
    const stages = (res.body.leads || []).map((l) => l.stage);
    assert.ok(stages.length > 0);
    assert.ok(!stages.includes('closed'), `closed leaked: ${stages.join(',')}`);
    assert.ok(!stages.includes('lost'), `lost leaked: ${stages.join(',')}`);
    assert.equal(res.body.pagination.total, stages.length);
  });

  it('stage=all returns every stage (explicit escape hatch)', async () => {
    const res = await request(api).get('/api/leads?stage=all&limit=50').set(auth(admin));
    assert.equal(res.status, 200);
    const stages = (res.body.leads || []).map((l) => l.stage);
    assert.ok(stages.includes('closed'));
    assert.ok(stages.includes('lost'));
    assert.equal(res.body.pagination.total, 5);
  });

  it('explicit terminal-stage lookups keep working', async () => {
    const closed = await request(api).get('/api/leads?stage=closed&limit=50').set(auth(admin));
    assert.equal(closed.status, 200);
    assert.ok(closed.body.leads.length >= 2);
    assert.ok(closed.body.leads.every((l) => l.stage === 'closed'));

    const lost = await request(api).get('/api/leads?stage=lost&limit=50').set(auth(admin));
    assert.equal(lost.status, 200);
    assert.ok(lost.body.leads.every((l) => l.stage === 'lost'));

    const bogus = await request(api).get('/api/leads?stage=bogus').set(auth(admin));
    assert.equal(bogus.status, 400);
  });

  it('countsByStage stays global (terminal counts still reported)', async () => {
    const res = await request(api).get('/api/leads?limit=1&includeCounts=true').set(auth(admin));
    assert.equal(res.status, 200);
    assert.ok(res.body.countsByStage);
    assert.equal(res.body.countsByStage.closed, 2);
    assert.equal(res.body.countsByStage.lost, 1);
    // The list itself still honors the default exclusion.
    assert.ok(!(res.body.leads || []).some((l) => ['closed', 'lost'].includes(l.stage)));
  });

  it('GET /api/leads/my-leads defaults to open pipeline, stays agent-scoped', async () => {
    const res = await request(api).get('/api/leads/my-leads?limit=50').set(auth(agent));
    assert.equal(res.status, 200);
    const stages = (res.body.leads || []).map((l) => l.stage);
    assert.ok(stages.length > 0);
    assert.ok(!stages.includes('closed') && !stages.includes('lost'));

    const all = await request(api).get('/api/leads/my-leads?stage=all&limit=50').set(auth(agent));
    assert.equal(all.status, 200);
    assert.ok(all.body.leads.map((l) => l.stage).includes('closed'));

    // Other agent sees only their own leads, default-filtered.
    const other = await request(api).get('/api/leads/my-leads?limit=50').set(auth(otherAgent));
    assert.equal(other.status, 200);
    assert.equal(other.body.leads.length, 0); // their only lead is closed

    const otherAll = await request(api).get('/api/leads/my-leads?stage=all&limit=50').set(auth(otherAgent));
    assert.equal(otherAll.body.leads.length, 1);
  });

  it('overdue follow-ups still exclude frozen verification-stage leads by default', async () => {
    const past = new Date(Date.now() - 86400000);
    await mkLead({ stage: 'pending_verification', nextFollowUp: past });
    const open = await mkLead({ stage: 'negotiation', nextFollowUp: past });

    const res = await request(api).get('/api/leads?nextFollowUp=overdue&limit=50').set(auth(admin));
    assert.equal(res.status, 200);
    const ids = (res.body.leads || []).map((l) => String(l._id));
    assert.ok(ids.includes(String(open._id)));
    assert.ok(!(res.body.leads || []).some((l) => l.stage === 'pending_verification'));
  });

  it('detail and explicit by-stage lookups bypass the default exclusion', async () => {
    const closed = await Lead.findOne({ stage: 'closed', assignedAgent: agent._id });
    const detail = await request(api).get(`/api/leads/${closed._id}`).set(auth(admin));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.lead.stage, 'closed');

    const byStage = await request(api).get('/api/leads/by-stage/closed').set(auth(admin));
    assert.equal(byStage.status, 200);
    assert.ok((byStage.body.leads || []).length >= 2);
  });
});
