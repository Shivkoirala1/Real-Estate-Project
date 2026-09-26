// Property detail poster gate: identity/contact visible only to admin, the
// owner, or an agent holding an open (not closed/lost) lead on the property.
// Run: node --test tests/property-contact-gate.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'property-contact-gate-test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const Lead = require('../models/Lead');
const Property = require('../models/Property');
const { PropertyType } = require('../models/Category');
const propertyRoutes = require('../routes/propertyRoutes');

describe('Property detail poster gate', () => {
  let mongod;
  let api;
  let admin;
  let owner;
  let buyer;
  let openAgent;
  let closedAgent;
  let strangerAgent;
  let property;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });

  let seq = 0;
  const mkUser = (role, tag) => {
    seq += 1;
    return User.create({
      name: `${tag} ${seq}`,
      email: `${tag}-${Date.now()}-${seq}@test.com`,
      password: 'password1',
      role,
    });
  };
  const mkLead = (agent, stage, tag) => {
    seq += 1;
    return Lead.create({
      name: `${tag} ${seq}`,
      email: `${tag}-${Date.now()}-${seq}@test.com`,
      stage,
      property: property._id,
      assignedAgent: agent._id,
    });
  };

  const getDetail = (user) => {
    const t = request(api).get(`/api/properties/${property._id}`);
    return user ? t.set(auth(user)) : t;
  };

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    app.use('/api/properties', propertyRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, owner, buyer, openAgent, closedAgent, strangerAgent] = await Promise.all([
      mkUser('admin', 'gate-admin'),
      mkUser('user', 'gate-owner'),
      mkUser('user', 'gate-buyer'),
      mkUser('agent', 'gate-open'),
      mkUser('agent', 'gate-closed'),
      mkUser('agent', 'gate-stranger'),
    ]);
    const ptype = await PropertyType.create({ name: 'Gate House', category: 'building' });
    property = await Property.create({
      title: 'Gate House',
      description: 'A property fixture for poster-gate tests.',
      propertyType: ptype._id,
      price: 5000000,
      saleType: 'sale',
      location: { province: 'Bagmati', district: 'Kathmandu' },
      listedBy: owner._id,
    });

    await Promise.all([
      mkLead(openAgent, 'negotiation', 'open'),
      mkLead(openAgent, 'pending_verification', 'inflight'),
      mkLead(closedAgent, 'closed', 'closed'),
      mkLead(closedAgent, 'lost', 'lost'),
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('hides the poster from anon, buyers and agents without an open lead', async () => {
    for (const [label, user] of [['anon', null], ['buyer', buyer], ['stranger', strangerAgent], ['closed-only', closedAgent]]) {
      const res = await getDetail(user);
      assert.equal(res.status, 200, label);
      assert.equal(res.body.property.listedBy, null, `${label} sees poster`);
    }
  });

  it('shows the poster to admin, owner and the open-lead agent', async () => {
    for (const [label, user] of [['admin', admin], ['owner', owner], ['open-agent', openAgent]]) {
      const res = await getDetail(user);
      assert.equal(res.status, 200, label);
      const poster = res.body.property.listedBy;
      assert.ok(poster && typeof poster === 'object', `${label} missing poster`);
      for (const k of ['name', 'email', 'phone']) {
        assert.ok(k in poster, `${label} missing ${k}`);
      }
    }
  });

  it('revokes visibility once the lead closes', async () => {
    await Lead.updateMany({ assignedAgent: openAgent._id }, { stage: 'closed' });
    const res = await getDetail(openAgent);
    assert.equal(res.status, 200);
    assert.equal(res.body.property.listedBy, null);
  });
});
