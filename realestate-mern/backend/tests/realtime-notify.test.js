// Phase 7: notification unread realtime events (centralized in notify()).
// Run: node --test tests/realtime-notify.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io: ioClient } = require('socket.io-client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase7-test-secret';

const { init, getIO, close } = require('../realtime/io');
const { NOTIFICATION_UNREAD } = require('../realtime/events');
const { publishNotificationUnread } = require('../realtime/notifyPublisher');
const { notify, notifyMany } = require('../utils/notify');
const { generateToken } = require('../utils/generateToken');
const User = require('../models/User');
const Notification = require('../models/Notification');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const basePayload = {
  type: 'system',
  title: 'Test notification',
  message: 'Test body',
  link: '',
};

describe('Phase 7 notification.unread', () => {
  let mongod;
  let httpServer;
  let port;

  let alice;
  let bob;

  const connectSocket = (user) =>
    new Promise((resolve, reject) => {
      const socket = ioClient(`http://127.0.0.1:${port}`, {
        auth: { token: generateToken(user._id, user.role) },
        reconnection: false,
        timeout: 5000,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(new Error(`connect failed: ${err.message}`)));
    });

  const collect = (socket) => {
    const events = [];
    socket.on(NOTIFICATION_UNREAD, (payload) => events.push(payload));
    return events;
  };

  const waitForEvent = async (events, index = 0, timeoutMs = 3000) => {
    const start = Date.now();
    while (events.length <= index && Date.now() - start < timeoutMs) {
      await sleep(50);
    }
    return events[index];
  };

  const dbUnread = (userId) =>
    Notification.countDocuments({ recipient: userId, isRead: false });

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    [alice, bob] = await Promise.all(
      [
        { name: 'Alice', email: 'nt-alice@example.com', password: 'password123' },
        { name: 'Bob', email: 'nt-bob@example.com', password: 'password123' },
      ].map((u) => User.create(u))
    );

    httpServer = http.createServer();
    init(httpServer);
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    port = httpServer.address().port;
  });

  after(async () => {
    await close();
    await new Promise((resolve) => httpServer.close(resolve));
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('notify() persists and emits the authoritative count to the right room', async () => {
    const aliceSocket = await connectSocket(alice);
    const bobSocket = await connectSocket(bob);
    const aliceEvents = collect(aliceSocket);
    const bobEvents = collect(bobSocket);

    const doc = await notify({ recipient: alice._id, ...basePayload });
    assert.ok(doc && doc._id, 'notification must be created');

    const evt = await waitForEvent(aliceEvents);
    assert.ok(evt);
    assert.deepEqual(Object.keys(evt), ['unreadCount']);
    assert.equal(evt.unreadCount, await dbUnread(alice._id));
    assert.equal(evt.unreadCount, 1);
    await sleep(400);
    assert.equal(bobEvents.length, 0, 'other user rooms get nothing');
    aliceSocket.disconnect();
    bobSocket.disconnect();
  });

  it('sequential notifications carry authoritative counts, not deltas', async () => {
    const socket = await connectSocket(alice);
    const events = collect(socket);
    const before = await dbUnread(alice._id);

    await notify({ recipient: alice._id, ...basePayload }); // before+1 unread
    await notify({ recipient: alice._id, ...basePayload }); // before+2 unread

    const first = await waitForEvent(events, 0);
    const second = await waitForEvent(events, 1);
    assert.equal(first.unreadCount, before + 1);
    assert.equal(second.unreadCount, before + 2);
    assert.equal(second.unreadCount, await dbUnread(alice._id));
    socket.disconnect();
  });

  it('read-state is reflected: read + new => correct current count', async () => {
    const socket = await connectSocket(alice);
    const events = collect(socket);

    await Notification.updateOne(
      { recipient: alice._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );
    await notify({ recipient: alice._id, ...basePayload });

    const evt = await waitForEvent(events);
    assert.equal(evt.unreadCount, await dbUnread(alice._id));
    socket.disconnect();
  });

  it('notifyMany() preserves dedup and publishes per actually-created recipient', async () => {
    const aliceSocket = await connectSocket(alice);
    const bobSocket = await connectSocket(bob);
    const aliceEvents = collect(aliceSocket);
    const bobEvents = collect(bobSocket);
    const beforeAlice = await dbUnread(alice._id);
    const beforeBob = await dbUnread(bob._id);

    // Duplicate alice id must create only one notification for her.
    await notifyMany([alice._id, alice._id, bob._id], {
      ...basePayload,
      title: 'Broadcast',
    });

    assert.equal(await dbUnread(alice._id), beforeAlice + 1);
    assert.equal(await dbUnread(bob._id), beforeBob + 1);

    const aliceEvt = await waitForEvent(aliceEvents);
    const bobEvt = await waitForEvent(bobEvents);
    assert.equal(aliceEvt.unreadCount, beforeAlice + 1);
    assert.equal(bobEvt.unreadCount, beforeBob + 1);
    aliceSocket.disconnect();
    bobSocket.disconnect();
  });

  it('fire-and-forget notify() (no await) still persists and emits', async () => {
    const socket = await connectSocket(bob);
    const events = collect(socket);
    const before = await dbUnread(bob._id);

    notify({ recipient: bob._id, ...basePayload, title: 'No await' }); // intentionally un-awaited
    const evt = await waitForEvent(events);
    assert.equal(evt.unreadCount, before + 1);
    assert.equal(await dbUnread(bob._id), before + 1);
    socket.disconnect();
  });

  it('publisher never throws: null doc, null io, throwing io', async () => {
    assert.equal(await publishNotificationUnread(null), false);
    const doc = await Notification.findOne({ recipient: alice._id });
    assert.equal(await publishNotificationUnread(doc, null), false);
    const badIO = {
      to: () => {
        throw new Error('transport down');
      },
    };
    assert.equal(await publishNotificationUnread(doc, badIO), false);
  });

  // NOTE: closes the realtime singleton; must stay last in this file.
  it('notification creation succeeds with realtime down', async () => {
    await close();
    const before = await dbUnread(alice._id);
    const doc = await notify({ recipient: alice._id, ...basePayload, title: 'IO down' });
    assert.ok(doc && doc._id, 'persistence must succeed without realtime');
    assert.equal(await dbUnread(alice._id), before + 1);
  });
});
