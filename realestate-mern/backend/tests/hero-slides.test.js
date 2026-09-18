// Phase 1: HeroSlide backend — validation, auth, public eligibility, reorder.
// Run: node --test tests/hero-slides.test.js
// NOTE: file-upload paths hit Cloudinary and are NOT covered here; seeded
// documents exercise eligibility/ordering, HTTP paths exercise validation
// and authorization (missing-media 400 proves the upload requirement).
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'hero-test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const HeroSlide = require('../models/HeroSlide');
const Property = require('../models/Property');
const { PropertyType } = require('../models/Category');
const heroSlideRoutes = require('../routes/heroSlideRoutes');

describe('HeroSlide Phase 1 backend', () => {
  let mongod;
  let api;
  let admin;
  let agent;
  let customer;
  let liveProperty;
  let soldProperty;

  const tokenFor = (user) => generateToken(user._id, user.role);
  const auth = (user) => ({ Authorization: `Bearer ${tokenFor(user)}` });
  const expired = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const seedSlide = (overrides = {}) =>
    HeroSlide.create({
      title: 'Test slide',
      media: { type: 'image', url: 'https://example.com/slide.jpg' },
      createdBy: admin._id,
      ...overrides,
    });

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    app.use('/api/hero-slides', heroSlideRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = request(app);

    [admin, agent, customer] = await Promise.all([
      User.create({ name: 'Admin', email: 'hero-admin@test.com', password: 'password1', role: 'admin' }),
      User.create({ name: 'Agent', email: 'hero-agent@test.com', password: 'password1', role: 'agent' }),
      User.create({ name: 'Customer', email: 'hero-user@test.com', password: 'password1', role: 'user' }),
    ]);

    const houseType = await PropertyType.create({ name: 'Hero Test House' });
    liveProperty = await Property.create({
      title: 'Live promotable home',
      description: 'A live listing for hero CTA tests',
      propertyType: houseType._id,
      price: 1000000,
      listedBy: admin._id,
      status: 'available',
    });
    soldProperty = await Property.create({
      title: 'Sold home',
      description: 'A sold listing for hero CTA tests',
      propertyType: houseType._id,
      price: 2000000,
      listedBy: admin._id,
      status: 'sold',
    });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('denies management to guests, customers and agents', async () => {
    const noAuth = await api.post('/api/hero-slides').send({ title: 'x' });
    assert.equal(noAuth.status, 401);

    const asCustomer = await api.post('/api/hero-slides').set(auth(customer)).send({ title: 'x' });
    assert.equal(asCustomer.status, 403);

    const asAgent = await api.post('/api/hero-slides').set(auth(agent)).send({ title: 'x' });
    assert.equal(asAgent.status, 403);

    const listAsCustomer = await api.get('/api/hero-slides/admin').set(auth(customer));
    assert.equal(listAsCustomer.status, 403);
  });

  it('requires a media file on create (upload path)', async () => {
    const res = await api.post('/api/hero-slides').set(auth(admin)).send({ title: 'No media' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /media file is required/i);
  });

  it('validates title, CTA, schedule and duration', async () => {
    const noTitle = await api.post('/api/hero-slides').set(auth(admin)).send({});
    assert.equal(noTitle.status, 400);
    assert.match(noTitle.body.message, /title is required/i);

    const badCta = await api
      .post('/api/hero-slides')
      .set(auth(admin))
      .send({ title: 'Bad CTA', ctaEnabled: 'true', ctaActionType: 'url', ctaActionValue: 'not-a-url', ctaLabel: 'Go' });
    assert.equal(badCta.status, 400);
    assert.match(badCta.body.message, /valid http/i);

    const badSchedule = await api
      .post('/api/hero-slides')
      .set(auth(admin))
      .send({ title: 'Bad dates', startAt: future.toISOString(), endAt: expired.toISOString() });
    assert.equal(badSchedule.status, 400);
    assert.match(badSchedule.body.message, /after the start/i);

    const badDuration = await api
      .post('/api/hero-slides')
      .set(auth(admin))
      .send({ title: 'Bad duration', duration: 120 });
    assert.equal(badDuration.status, 400);
    assert.match(badDuration.body.message, /duration/i);
  });

  it('rejects property CTAs for missing or unpromotable properties', async () => {
    // Exercised via update (create requires a real Cloudinary upload, so
    // seeded documents + update carry the CTA-validation coverage).
    const slide = await seedSlide({ title: 'CTA target' });

    const missing = await api
      .put(`/api/hero-slides/${slide._id}`)
      .set(auth(admin))
      .send({
        ctaEnabled: 'true',
        ctaActionType: 'property',
        ctaActionValue: new mongoose.Types.ObjectId().toString(),
        ctaLabel: 'View',
      });
    assert.equal(missing.status, 404);

    const sold = await api
      .put(`/api/hero-slides/${slide._id}`)
      .set(auth(admin))
      .send({
        ctaEnabled: 'true',
        ctaActionType: 'property',
        ctaActionValue: soldProperty._id.toString(),
        ctaLabel: 'View',
      });
    assert.equal(sold.status, 400);
    assert.match(sold.body.message, /not available for promotion/i);

    const live = await api
      .put(`/api/hero-slides/${slide._id}`)
      .set(auth(admin))
      .send({
        ctaEnabled: 'true',
        ctaActionType: 'property',
        ctaActionValue: liveProperty._id.toString(),
        ctaLabel: 'View',
      });
    assert.equal(live.status, 200);
    assert.equal(live.body.slide.property, liveProperty._id.toString());
    await slide.deleteOne();
  });

  it('public feed returns only active slides in order without admin fields', async () => {
    await HeroSlide.deleteMany({});
    await seedSlide({ status: 'published', displayOrder: 2, title: 'Second active' });
    await seedSlide({ status: 'published', displayOrder: 1, title: 'First active' });
    await seedSlide({ status: 'draft', displayOrder: 0, title: 'Draft hidden' });
    await seedSlide({ status: 'published', displayOrder: 0, title: 'Future hidden', startAt: future });
    await seedSlide({ status: 'published', displayOrder: 0, title: 'Expired hidden', endAt: expired });
    await seedSlide({
      status: 'published',
      displayOrder: 0,
      title: 'Sold-link hidden',
      property: soldProperty._id,
      cta: { enabled: true, label: 'View', actionType: 'property', actionValue: soldProperty._id.toString() },
    });

    const res = await api.get('/api/hero-slides');
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.slides.map((s) => s.title),
      ['First active', 'Second active']
    );
    for (const slide of res.body.slides) {
      assert.ok(!('publicId' in (slide.media || {})), 'public media must not leak publicId');
      assert.ok(!('createdBy' in slide), 'public media must not leak audit fields');
    }
  });

  it('admin list includes every state with derived effectiveState', async () => {
    const res = await api.get('/api/hero-slides/admin').set(auth(admin));
    assert.equal(res.status, 200);
    assert.equal(res.body.pagination.total, 6);
    const byTitle = new Map(res.body.slides.map((s) => [s.title, s.effectiveState]));
    assert.equal(byTitle.get('Draft hidden'), 'draft');
    assert.equal(byTitle.get('Future hidden'), 'scheduled');
    assert.equal(byTitle.get('Expired hidden'), 'expired');
    assert.equal(byTitle.get('First active'), 'active');
  });

  it('normalizes numeric reorder input to gapless positions', async () => {
    const slides = await HeroSlide.find({}).sort({ title: 1 });
    const res = await api
      .put('/api/hero-slides/reorder')
      .set(auth(admin))
      .send({ order: slides.map((s) => ({ id: s._id, displayOrder: 99 })) });
    assert.equal(res.status, 200);
    assert.deepEqual(
      res.body.slides.map((s) => s.displayOrder),
      [1, 2, 3, 4, 5, 6]
    );

    const badId = await api
      .put('/api/hero-slides/reorder')
      .set(auth(admin))
      .send({ order: [{ id: 'not-an-id', displayOrder: 1 }] });
    assert.equal(badId.status, 400);
  });

  it('admin get/update/delete round-trip with 404s for unknown ids', async () => {
    const slide = await seedSlide({ status: 'draft', title: 'Round trip' });
    const unknownId = new mongoose.Types.ObjectId().toString();

    const got = await api.get(`/api/hero-slides/${slide._id}`).set(auth(admin));
    assert.equal(got.status, 200);
    assert.equal(got.body.slide.effectiveState, 'draft');

    const missing = await api.get(`/api/hero-slides/${unknownId}`).set(auth(admin));
    assert.equal(missing.status, 404);

    const updated = await api
      .put(`/api/hero-slides/${slide._id}`)
      .set(auth(admin))
      .send({ title: 'Round trip edited', status: 'published', duration: 10 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.slide.title, 'Round trip edited');
    assert.equal(updated.body.slide.duration, 10);

    const deleted = await api.delete(`/api/hero-slides/${slide._id}`).set(auth(admin));
    assert.equal(deleted.status, 200);
    const gone = await api.get(`/api/hero-slides/${slide._id}`).set(auth(admin));
    assert.equal(gone.status, 404);
  });
});
