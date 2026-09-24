// Notification category tabs — server-side ?category= filtering and
// per-category unread badges.
// Run: node --test tests/notification-categories.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'notification-category-test-secret';

const { generateToken } = require('../utils/generateToken');
const { notFound, errorHandler } = require('../middleware/errorHandler');
const User = require('../models/User');
const Notification = require('../models/Notification');
const notificationRoutes = require('../routes/notificationRoutes');

describe('Notification category tabs', () => {
  let mongod;
  let api;
  let user;
  let otherUser;

  const auth = (u) => ({ Authorization: `Bearer ${generateToken(u._id, u.role)}` });

  const seed = (recipient, type, isRead = false) =>
    Notification.create({ recipient, type, title: `${type} title`, message: `${type} message`, isRead });

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    const app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationRoutes);
    app.use(notFound);
    app.use(errorHandler);
    api = app;

    [user, otherUser] = await Promise.all([
      User.create({ name: 'CatUser', email: 'cat-user@test.com', password: 'password1', role: 'user' }),
      User.create({ name: 'CatOther', email: 'cat-other@test.com', password: 'password1', role: 'user' }),
    ]);

    // user: messages x2 (1 unread), visits x1 (unread), deals x3 (2 unread),
    // management x1 (read), payments x1 (unread), system x1 (unread, legacy).
    await Promise.all([
      seed(user._id, 'conversation_message', false),
      seed(user._id, 'contact_form_responded', true),
      seed(user._id, 'visit_confirmed', false),
      seed(user._id, 'lead_assigned', false),
      seed(user._id, 'sale_verified', false),
      seed(user._id, 'rental_rejected', true),
      seed(user._id, 'management_request_accepted', true),
      seed(user._id, 'emi_installment_due', false),
      seed(user._id, 'inquiry_received', false),
      // Other recipient's rows must never leak into user's results/counts.
      seed(otherUser._id, 'lead_assigned', false),
      seed(otherUser._id, 'visit_confirmed', false),
    ]);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('filters each category to its own types only', async () => {
    const expectations = {
      messages: ['contact_form_responded', 'conversation_message'],
      visits: ['visit_confirmed'],
      deals: ['lead_assigned', 'rental_rejected', 'sale_verified'],
      management: ['management_request_accepted'],
      payments: ['emi_installment_due'],
    };
    for (const [category, types] of Object.entries(expectations)) {
      const res = await request(api).get('/api/notifications').set(auth(user)).query({ category, limit: 50 });
      assert.equal(res.status, 200);
      assert.deepEqual(
        res.body.notifications.map((n) => n.type).sort(),
        [...types].sort(),
        `category=${category}`
      );
    }
  });

  it('omitted category keeps All behavior (incl. legacy/system rows)', async () => {
    const res = await request(api).get('/api/notifications').set(auth(user)).query({ limit: 50 });
    assert.equal(res.status, 200);
    assert.equal(res.body.notifications.length, 9);
    assert.ok(res.body.notifications.some((n) => n.type === 'inquiry_received'));
  });

  it('rejects unknown categories with 400', async () => {
    const res = await request(api).get('/api/notifications').set(auth(user)).query({ category: 'does_not_exist' });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  it('composes category with the unread filter and pagination', async () => {
    const unread = await request(api).get('/api/notifications').set(auth(user)).query({ category: 'deals', filter: 'unread', limit: 50 });
    assert.equal(unread.status, 200);
    assert.deepEqual(unread.body.notifications.map((n) => n.type).sort(), ['lead_assigned', 'sale_verified']);

    const p1 = await request(api).get('/api/notifications').set(auth(user)).query({ category: 'deals', limit: 2, page: 1 });
    const p2 = await request(api).get('/api/notifications').set(auth(user)).query({ category: 'deals', limit: 2, page: 2 });
    assert.equal(p1.body.notifications.length, 2);
    assert.equal(p2.body.notifications.length, 1);
    assert.equal(p1.body.pagination.total, 3);
    assert.deepEqual(
      [...p1.body.notifications, ...p2.body.notifications].map((n) => String(n._id)).sort(),
      p1.body.notifications.concat(p2.body.notifications).map((n) => String(n._id)).sort()
    );
    const ids = [...p1.body.notifications, ...p2.body.notifications].map((n) => String(n._id));
    assert.equal(new Set(ids).size, 3, 'pages must not overlap');
  });

  it('returns global + per-category unread counts with zeros and recipient isolation', async () => {
    const res = await request(api).get('/api/notifications').set(auth(user)).query({ limit: 1 });
    assert.equal(res.status, 200);
    // 6 unread total; management fully read; other's rows excluded.
    assert.equal(res.body.unreadCount, 6);
    assert.deepEqual(res.body.unreadByCategory, {
      messages: 1,
      visits: 1,
      deals: 2,
      management: 0,
      payments: 1,
    });

    const other = await request(api).get('/api/notifications').set(auth(otherUser)).query({ limit: 1 });
    assert.equal(other.body.unreadCount, 2);
    assert.deepEqual(other.body.unreadByCategory, {
      messages: 0,
      visits: 1,
      deals: 1,
      management: 0,
      payments: 0,
    });
  });

  it('reflects reads and deletes in counts without client refetch tricks', async () => {
    const target = await Notification.findOne({ recipient: user._id, type: 'emi_installment_due' });
    const read = await request(api).patch(`/api/notifications/${target._id}/read`).set(auth(user));
    assert.equal(read.status, 200);
    const afterRead = await request(api).get('/api/notifications').set(auth(user)).query({ limit: 1 });
    assert.equal(afterRead.body.unreadByCategory.payments, 0);
    assert.equal(afterRead.body.unreadCount, 5);

    const doomed = await Notification.findOne({ recipient: user._id, type: 'visit_confirmed' });
    const del = await request(api).delete(`/api/notifications/${doomed._id}`).set(auth(user));
    assert.equal(del.status, 200);
    const afterDelete = await request(api).get('/api/notifications').set(auth(user)).query({ limit: 1 });
    assert.equal(afterDelete.body.unreadByCategory.visits, 0);
    assert.equal(afterDelete.body.unreadCount, 4);

    const visits = await request(api).get('/api/notifications').set(auth(user)).query({ category: 'visits', limit: 50 });
    assert.equal(visits.body.notifications.length, 0);
  });

  it('uses an index for the recipient + type category query (spot check)', async () => {
    const { typesForCategory } = require('../utils/notificationCategories');
    const plan = await Notification.collection
      .find({ recipient: user._id, type: { $in: typesForCategory('deals') } })
      .sort({ createdAt: -1 })
      .explain();
    const stages = [];
    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.stage) stages.push(node.stage);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') walk(value);
      }
    };
    walk(plan.queryPlanner.winningPlan);
    console.log(`      explain stages: ${[...new Set(stages)].join(', ')}`);
    assert.ok(!stages.includes('COLLSCAN'), `category query must not collection-scan (stages: ${stages.join(', ')})`);
  });
});
