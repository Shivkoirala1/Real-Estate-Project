// Per-listing terms acceptance: required on every create (all sale types
// incl. the management wizard), never on edits; acceptance timestamped.
// Run: node --test tests/property-terms.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'property-terms-test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const Property = require('../models/Property');
const SiteSetting = require('../models/SiteSetting');
const { PropertyType } = require('../models/Category');
const propertyRoutes = require('../routes/propertyRoutes');
const propertyManagementRoutes = require('../routes/propertyManagementRoutes');

describe('Per-listing terms acceptance', () => {
  let mongod;
  let api;
  let admin;
  let owner;
  let ptype;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });

  let seq = 0;
  const payload = () => {
    seq += 1;
    return {
      title: `Terms House ${seq} spacious family home`,
      description: 'A wonderful family home near the main road with a garden and parking space.',
      propertyType: String(ptype._id),
      saleType: 'management',
      location: { province: 'Bagmati Province', district: 'Kathmandu', municipality: 'Kathmandu' },
      details: { landArea: 5, builtUpArea: 2000, bedrooms: 3, bathrooms: 2, floors: 2 },
    };
  };

  const publishPolicies = (text) =>
    SiteSetting.updateOne({ key: 'site' }, { policies: text, policiesUpdatedAt: new Date() });

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    app.use('/api/properties', propertyRoutes);
    app.use('/api/property-management', propertyManagementRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, owner] = await Promise.all([
      User.create({ name: 'PT Admin', email: 'pt-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'PT Owner', email: 'pt-owner@test.com', password: 'password1', role: 'user', verificationStatus: 'verified', isEmailVerified: true }),
    ]);
    ptype = await PropertyType.create({ name: 'PT House', category: 'building' });
    await SiteSetting.updateOne(
      { key: 'site' },
      { key: 'site', policies: 'Listing terms v1: be honest about your property.', policiesUpdatedAt: new Date() },
      { upsert: true }
    );
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('create without acceptance is rejected (400), nothing created', async () => {
    for (const body of [payload(), { ...payload(), termsAccepted: false }, { ...payload(), termsAccepted: 'false' }]) {
      const res = await request(api).post('/api/properties').set(auth(owner)).send(body);
      assert.equal(res.status, 400);
      assert.match(res.body.message, /Terms and Policies/);
    }
    assert.equal(await Property.countDocuments({}), 0);
  });

  it('create with acceptance succeeds and timestamps it', async () => {
    const res = await request(api).post('/api/properties').set(auth(owner)).send({ ...payload(), termsAccepted: true });
    assert.equal(res.status, 201);
    const doc = await Property.findById(res.body.property._id);
    assert.ok(doc.termsAcceptedAt instanceof Date);
  });

  it('create is blocked while no policies are published', async () => {
    await publishPolicies('');
    const res = await request(api).post('/api/properties').set(auth(owner)).send({ ...payload(), termsAccepted: true });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /not published yet/);
    await publishPolicies('Listing terms v1: be honest about your property.');
  });

  it('management wizard enforces the same gate', async () => {
    const ManagementService = require('../models/ManagementService');
    await ManagementService.create({ name: 'PT Caretaking', description: 'd', isActive: true });
    const base = payload();
    const denied = await request(api).post('/api/property-management/with-property').set(auth(owner)).send({
      property: { title: base.title, description: base.description, propertyType: base.propertyType, location: base.location, details: base.details },
      services: ['PT Caretaking'],
    });
    assert.equal(denied.status, 400);
    assert.match(denied.body.message, /Terms and Policies/);

    const ok = await request(api).post('/api/property-management/with-property').set(auth(owner)).send({
      property: { title: base.title, description: base.description, propertyType: base.propertyType, location: base.location, details: base.details, termsAccepted: true },
      services: ['PT Caretaking'],
    });
    assert.equal(ok.status, 201);
    assert.ok((await Property.findById(ok.body.property._id)).termsAcceptedAt instanceof Date);
  });

  it('edits never require acceptance and preserve the timestamp', async () => {
    const created = await request(api).post('/api/properties').set(auth(owner)).send({ ...payload(), termsAccepted: true });
    const before = (await Property.findById(created.body.property._id)).termsAcceptedAt;
    const res = await request(api).put(`/api/properties/${created.body.property._id}`).set(auth(owner)).send({ title: 'Terms House retitled for resale here' });
    assert.equal(res.status, 200);
    assert.equal(new Date((await Property.findById(created.body.property._id)).termsAcceptedAt).getTime(), new Date(before).getTime());
  });
});
