// Site settings singleton: public read (auto-seeded), admin-only write,
// validation, singleton invariant.
// Run: node --test tests/site-settings.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'site-settings-test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const SiteSetting = require('../models/SiteSetting');
const siteSettingRoutes = require('../routes/siteSettingRoutes');

describe('Site settings', () => {
  let mongod;
  let api;
  let admin;
  let agent;

  const auth = (user) => ({ Authorization: `Bearer ${generateToken(user._id, user.role)}` });

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    app.use('/api/site-settings', siteSettingRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, agent] = await Promise.all([
      User.create({ name: 'SS Admin', email: 'ss-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'SS Agent', email: 'ss-agent@test.com', password: 'password1', role: 'agent' }),
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('public GET auto-seeds defaults matching the legacy hardcoded values', async () => {
    const res = await request(api).get('/api/site-settings');
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.office.address, 'Itahari Ward No. 6, Itahari, Koshi Province');
    assert.ok(res.body.settings.office.phone);
    assert.ok(res.body.settings.office.email);
    assert.equal(typeof res.body.settings.office.lat, 'number');
    assert.ok(res.body.settings.socials.facebook.startsWith('https://'));
    assert.ok(res.body.settings.socials.tiktok.startsWith('https://'));
    assert.equal(await SiteSetting.countDocuments({ key: 'site' }), 1);
  });

  it('PUT is admin-only', async () => {
    const payload = { office: { phone: '+977 9800000000' } };
    assert.equal((await request(api).put('/api/site-settings').send(payload)).status, 401);
    assert.equal((await request(api).put('/api/site-settings').set(auth(agent)).send(payload)).status, 403);
  });

  it('PUT validates email, coords and social URLs', async () => {
    assert.equal((await request(api).put('/api/site-settings').set(auth(admin)).send({ office: { email: 'nope' } })).status, 400);
    assert.equal((await request(api).put('/api/site-settings').set(auth(admin)).send({ office: { lat: 999 } })).status, 400);
    assert.equal((await request(api).put('/api/site-settings').set(auth(admin)).send({ socials: { facebook: 'not-a-url' } })).status, 400);
    // Failed writes change nothing.
    const current = await request(api).get('/api/site-settings');
    assert.ok(current.body.settings.office.email.includes('@'));
  });

  it('PUT persists + GET reflects, singleton never duplicates', async () => {
    const res = await request(api).put('/api/site-settings').set(auth(admin)).send({
      office: { address: 'New Road, Kathmandu', phone: '+977 9800000001', email: 'office@example.com', lat: 27.7, lng: 85.3 },
      socials: { facebook: 'https://facebook.com/example', instagram: 'https://instagram.com/example', whatsapp: '' },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.settings.office.address, 'New Road, Kathmandu');
    assert.equal(res.body.settings.socials.instagram, 'https://instagram.com/example');
    // Untouched keys preserved (partial update).
    assert.ok(res.body.settings.socials.tiktok.startsWith('https://'));

    const again = await request(api).get('/api/site-settings');
    assert.equal(again.body.settings.office.email, 'office@example.com');
    assert.equal(await SiteSetting.countDocuments({ key: 'site' }), 1);
  });
});
