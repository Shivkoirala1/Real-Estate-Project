// Phase 8: conversation unread realtime events.
// Run: node --test tests/realtime-conversation-unread.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io: ioClient } = require('socket.io-client');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase8-test-secret';

const { init, getIO, close } = require('../realtime/io');
const { CONVERSATION_UNREAD, CONVERSATION_MESSAGE, NOTIFICATION_UNREAD } = require('../realtime/events');
const { publishConversationUnread } = require('../realtime/publishConversationUnread');
const { generateToken } = require('../utils/generateToken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const conversationRoutes = require('../routes/conversationRoutes');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Phase 8 conversation.unread', () => {
  let mongod;
  let app;
  let httpServer;
  let port;

  let inquirer;
  let owner;
  let admin;
  let stranger;
  let u1;
  let u2;
  let thread1;
  let thread2;
  let zeroThread;

  const tokenFor = (user) => generateToken(user._id, user.role);

  const call = (user, method, path, body) => {
    let req = request(app)[method](path).set('Authorization', `Bearer ${tokenFor(user)}`);
    if (body) req = req.send(body);
    return req;
  };
  const sendAs = (user, id, body) =>
    call(user, 'patch', `/api/conversations/${id}/messages`, { message: body });
  const openAs = (user, id) => call(user, 'get', `/api/conversations/${id}`);
  const restUnread = async (user) => {
    const res = await call(user, 'get', '/api/conversations/unread-count');
    assert.equal(res.status, 200);
    return res.body.unreadCount;
  };

  const connectSocket = (user) =>
    new Promise((resolve, reject) => {
      const socket = ioClient(`http://127.0.0.1:${port}`, {
        auth: { token: tokenFor(user) },
        reconnection: false,
        timeout: 5000,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => reject(new Error(`connect failed: ${err.message}`)));
    });

  const collect = (socket, event) => {
    const events = [];
    socket.on(event, (payload) => events.push(payload));
    return events;
  };

  const waitForEvent = async (events, index = 0, timeoutMs = 3000) => {
    const start = Date.now();
    while (events.length <= index && Date.now() - start < timeoutMs) {
      await sleep(50);
    }
    return events[index];
  };

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    [inquirer, owner, admin, stranger, u1, u2] = await Promise.all(
      [
        { name: 'Inquirer', email: 'cu-inquirer@example.com', password: 'password123', role: 'user' },
        { name: 'Owner', email: 'cu-owner@example.com', password: 'password123', role: 'agent' },
        { name: 'Admin', email: 'cu-admin@example.com', password: 'password123', role: 'admin' },
        { name: 'Stranger', email: 'cu-stranger@example.com', password: 'password123', role: 'user' },
        { name: 'U1', email: 'cu-u1@example.com', password: 'password123', role: 'user' },
        { name: 'U2', email: 'cu-u2@example.com', password: 'password123', role: 'agent' },
      ].map((u) => User.create(u))
    );

    [thread1, thread2, zeroThread] = await Promise.all([
      Conversation.create({ inquirer: inquirer._id, owner: owner._id }),
      Conversation.create({ inquirer: inquirer._id, owner: owner._id }),
      Conversation.create({ inquirer: u1._id, owner: u2._id }),
    ]);

    app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationRoutes);

    httpServer = http.createServer(app);
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

  it('incoming message emits authoritative count to recipient only, plus the message event', async () => {
    const ownerSocket = await connectSocket(owner);
    const inquirerSocket = await connectSocket(inquirer);
    const ownerUnread = collect(ownerSocket, CONVERSATION_UNREAD);
    const ownerMessages = collect(ownerSocket, CONVERSATION_MESSAGE);
    const inquirerUnread = collect(inquirerSocket, CONVERSATION_UNREAD);
    await new Promise((resolve) => {
      ownerSocket.emit('conversation.join', { conversationId: String(thread1._id) }, () => resolve());
    });

    const res = await sendAs(inquirer, String(thread1._id), 'unread hello');
    assert.equal(res.status, 200);

    const unreadEvt = await waitForEvent(ownerUnread);
    assert.ok(unreadEvt);
    assert.deepEqual(Object.keys(unreadEvt), ['unreadCount']);
    assert.equal(unreadEvt.unreadCount, 1);
    assert.equal(unreadEvt.unreadCount, await restUnread(owner));

    const msgEvt = await waitForEvent(ownerMessages);
    assert.ok(msgEvt, 'message event still emitted alongside');

    await sleep(400);
    assert.equal(inquirerUnread.length, 0, 'sender gets no unread increment');
    ownerSocket.disconnect();
    inquirerSocket.disconnect();
  });

  it('thread-level counts stay authoritative across messages and threads', async () => {
    const ownerSocket = await connectSocket(owner);
    const events = collect(ownerSocket, CONVERSATION_UNREAD);

    await sendAs(inquirer, String(thread1._id), 'second ping same thread');
    const stillOne = await waitForEvent(events, 0);
    assert.equal(stillOne.unreadCount, 1, 'same thread stays one unread thread');

    await sendAs(inquirer, String(thread2._id), 'ping other thread');
    const nowTwo = await waitForEvent(events, 1);
    assert.equal(nowTwo.unreadCount, 2);
    assert.equal(nowTwo.unreadCount, await restUnread(owner));
    ownerSocket.disconnect();
  });

  it('opening a thread stamps read state and emits the new authoritative count', async () => {
    const ownerSocket = await connectSocket(owner);
    const events = collect(ownerSocket, CONVERSATION_UNREAD);
    const before = await restUnread(owner);
    assert.ok(before >= 1);

    const res = await openAs(owner, String(thread1._id));
    assert.equal(res.status, 200);
    const stamped = await Conversation.findById(thread1._id);
    assert.ok(stamped.lastReadAt && stamped.lastReadAt.owner, 'open must stamp lastReadAt');

    const evt = await waitForEvent(events);
    assert.equal(evt.unreadCount, before - 1);
    assert.equal(evt.unreadCount, await restUnread(owner));
    ownerSocket.disconnect();
  });

  it('count reaches zero: dedicated pair open clears the only unread thread', async () => {
    const u2Socket = await connectSocket(u2);
    const events = collect(u2Socket, CONVERSATION_UNREAD);

    assert.equal((await sendAs(u1, String(zeroThread._id), 'zero hello')).status, 200);
    const one = await waitForEvent(events, 0);
    assert.equal(one.unreadCount, 1);

    assert.equal((await openAs(u2, String(zeroThread._id))).status, 200);
    const zero = await waitForEvent(events, 1);
    assert.equal(zero.unreadCount, 0);
    assert.equal(await restUnread(u2), 0);
    u2Socket.disconnect();
  });

  it('failed/unauthorized open emits nothing', async () => {
    const strangerSocket = await connectSocket(stranger);
    const events = collect(strangerSocket, CONVERSATION_UNREAD);

    const forbidden = await openAs(stranger, String(thread1._id));
    assert.equal(forbidden.status, 403);
    const missing = await openAs(stranger, String(new mongoose.Types.ObjectId()));
    assert.equal(missing.status, 404);
    await sleep(500);
    assert.equal(events.length, 0);
    strangerSocket.disconnect();
  });

  it('owner send emits both notification.unread and conversation.unread, exactly once each', async () => {
    const inqSocket = await connectSocket(inquirer);
    const notifEvents = collect(inqSocket, NOTIFICATION_UNREAD);
    const unreadEvents = collect(inqSocket, CONVERSATION_UNREAD);

    assert.equal((await sendAs(owner, String(thread2._id), 'owner broadcast')).status, 200);

    const notif = await waitForEvent(notifEvents);
    const unread = await waitForEvent(unreadEvents);
    assert.ok(notif && unread, 'both counters change so both events fire');
    assert.deepEqual(Object.keys(notif), ['unreadCount']);
    assert.deepEqual(Object.keys(unread), ['unreadCount']);
    await sleep(400);
    assert.equal(notifEvents.length, 1, 'no duplicate notification event');
    assert.equal(unreadEvents.length, 1, 'no duplicate unread event');
    inqSocket.disconnect();
  });

  it('two sockets of the same user receive the same count', async () => {
    const s1 = await connectSocket(owner);
    const s2 = await connectSocket(owner);
    const e1 = collect(s1, CONVERSATION_UNREAD);
    const e2 = collect(s2, CONVERSATION_UNREAD);

    await sendAs(inquirer, String(thread2._id), 'multi-tab ping');
    const [a, b] = await Promise.all([waitForEvent(e1), waitForEvent(e2)]);
    assert.equal(a.unreadCount, b.unreadCount);
    assert.equal(a.unreadCount, await restUnread(owner));
    s1.disconnect();
    s2.disconnect();
  });

  it('close/reopen refresh both participants authoritative counts', async () => {
    const inqSocket = await connectSocket(inquirer);
    const ownerSocket = await connectSocket(owner);
    const inqEvents = collect(inqSocket, CONVERSATION_UNREAD);
    const ownerEvents = collect(ownerSocket, CONVERSATION_UNREAD);

    const closed = await call(owner, 'patch', `/api/conversations/${thread2._id}/close`);
    assert.equal(closed.status, 200);
    const [c1, c2] = await Promise.all([waitForEvent(inqEvents), waitForEvent(ownerEvents)]);
    assert.equal(c1.unreadCount, await restUnread(inquirer));
    assert.equal(c2.unreadCount, await restUnread(owner));

    const reopened = await call(admin, 'patch', `/api/conversations/${thread2._id}/reopen`);
    assert.equal(reopened.status, 200);
    const [r1, r2] = await Promise.all([
      waitForEvent(inqEvents, 1),
      waitForEvent(ownerEvents, 1),
    ]);
    assert.equal(r1.unreadCount, await restUnread(inquirer));
    assert.equal(r2.unreadCount, await restUnread(owner));
    inqSocket.disconnect();
    ownerSocket.disconnect();
  });

  it('publisher never throws: null user, null io, throwing io', async () => {
    assert.equal(await publishConversationUnread(null), false);
    assert.equal(await publishConversationUnread(owner._id, null), false);
    const badIO = {
      to: () => {
        throw new Error('transport down');
      },
    };
    assert.equal(await publishConversationUnread(owner._id, badIO), false);
  });

  it('closed send still 403 and REST unread endpoint unchanged', async () => {
    const res = await call(admin, 'patch', `/api/conversations/${thread2._id}/close`);
    assert.equal(res.status, 200);
    const blocked = await sendAs(inquirer, String(thread2._id), 'blocked again');
    assert.equal(blocked.status, 403);

    const unreadRes = await call(owner, 'get', '/api/conversations/unread-count');
    assert.equal(unreadRes.status, 200);
    assert.deepEqual(Object.keys(unreadRes.body).sort(), ['success', 'unreadCount']);
  });

  // NOTE: closes the realtime singleton; must stay last in this file.
  it('REST send/open succeed with realtime down', async () => {
    await close();
    assert.equal((await sendAs(inquirer, String(thread1._id), 'io-down ping')).status, 200);
    assert.equal((await openAs(owner, String(thread1._id))).status, 200);
  });
});
