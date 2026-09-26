// Property video tour link: admin-only set/clear with https validation;
// owners/agents can neither set nor clear (existing links preserved).
// Run: node --test tests/property-video.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'property-video-test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const Property = require('../models/Property');
const { PropertyType } = require('../models/Category');
const propertyRoutes = require('../routes/propertyRoutes');

describe('Property video link gate', () => {
  let mongod;
  let api;
  let admin;
  let owner;
  let agent;
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
      verificationStatus: 'verified',
      isEmailVerified: true,
    });
  };

  const setVideo = async (v) => {
    await Property.updateOne({ _id: property._id }, { 'media.video': v });
  };
  const currentVideo = async () => (await Property.findById(property._id)).media.video;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    app.use('/api/properties', propertyRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [admin, owner, agent] = await Promise.all([
      mkUser('admin', 'vid-admin'),
      mkUser('user', 'vid-owner'),
      mkUser('agent', 'vid-agent'),
    ]);
    const ptype = await PropertyType.create({ name: 'Vid House', category: 'building' });
    property = await Property.create({
      title: 'Video Gate House',
      description: 'A property fixture for video-gate tests.',
      propertyType: ptype._id,
      price: 5000000,
      saleType: 'sale',
      location: { province: 'Bagmati Province', district: 'Kathmandu', municipality: 'Kathmandu' },
      details: { landArea: 5, builtUpArea: 2000, bedrooms: 3, bathrooms: 2, floors: 2 },
      media: { coverImage: 'http://x.test/cover.jpg', images: [], video: '' },
      listedBy: owner._id,
    });
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('owner cannot set or clear the link (existing value preserved)', async () => {
    await setVideo('https://youtube.com/watch?v=grandfathered');
    const set = await request(api).put(`/api/properties/${property._id}`).set(auth(owner)).send({ video: 'https://youtube.com/watch?v=owner' });
    assert.equal(set.status, 200);
    assert.equal(await currentVideo(), 'https://youtube.com/watch?v=grandfathered');

    const clear = await request(api).put(`/api/properties/${property._id}`).set(auth(owner)).send({ video: '' });
    assert.equal(clear.status, 200);
    assert.equal(await currentVideo(), 'https://youtube.com/watch?v=grandfathered');

    // Ordinary owner edits leave the link untouched.
    const edit = await request(api).put(`/api/properties/${property._id}`).set(auth(owner)).send({ title: 'Video Gate House Edited' });
    assert.equal(edit.status, 200);
    assert.equal(await currentVideo(), 'https://youtube.com/watch?v=grandfathered');
  });

  it('unrelated agent gets 403, anon gets 401', async () => {
    await setVideo('');
    assert.equal((await request(api).put(`/api/properties/${property._id}`).set(auth(agent)).send({ video: 'https://youtube.com/watch?v=x' })).status, 403);
    assert.equal((await request(api).put(`/api/properties/${property._id}`).send({ video: 'https://youtube.com/watch?v=x' })).status, 401);
    assert.equal(await currentVideo(), '');
  });

  it('admin can set and clear the link', async () => {
    const set = await request(api).put(`/api/properties/${property._id}`).set(auth(admin)).send({ video: 'https://youtube.com/watch?v=admin' });
    assert.equal(set.status, 200);
    assert.equal(await currentVideo(), 'https://youtube.com/watch?v=admin');

    const clear = await request(api).put(`/api/properties/${property._id}`).set(auth(admin)).send({ video: '' });
    assert.equal(clear.status, 200);
    assert.equal(await currentVideo(), '');
  });

  it('admin garbage URLs rejected (400), stored value untouched', async () => {
    await setVideo('https://youtube.com/watch?v=keep');
    for (const bad of ['notaurl', 'http://insecure.com/v', 'javascript:alert(1)']) {
      const res = await request(api).put(`/api/properties/${property._id}`).set(auth(admin)).send({ video: bad });
      assert.equal(res.status, 400, bad);
      assert.match(res.body.message, /https/);
    }
    assert.equal(await currentVideo(), 'https://youtube.com/watch?v=keep');
  });
});
