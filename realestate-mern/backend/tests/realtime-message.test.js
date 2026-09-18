// Phase 5: live conversation messages — REST guard + socket emission tests.
// Run: node --test tests/realtime-message.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io: ioClient } = require('socket.io-client');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase5-test-secret';

const { init, getIO, close } = require('../realtime/io');
const { CONVERSATION_MESSAGE } = require('../realtime/events');
const { emitConversationMessage } = require('../realtime/publishMessage');
const { generateToken } = require('../utils/generateToken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const conversationRoutes = require('../routes/conversationRoutes');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Phase 5 conversation.message', () => {
  let mongod;
  let app;
  let httpServer;
  let port;
  let api;

  let inquirer;
  let owner;
  let admin;
  let adminOwner;
  let stranger;
  let thread;
  let adminOwnedThread;
  let closedThread;

  const tokenFor = (user) => generateToken(user._id, user.role);

  const sendMessage = (user, conversationId, body) =>
    api
      .patch(`/api/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${tokenFor(user)}`)
      .send({ message: body });

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

  const joinRoom = (socket, conversationId) =>
    new Promise((resolve) => {
      socket.emit('conversation.join', { conversationId }, (ack) => resolve(ack));
    });

  const collect = (socket) => {
    const events = [];
    socket.on(CONVERSATION_MESSAGE, (payload) => events.push(payload));
    return events;
  };

  const waitForEvent = async (events, timeoutMs = 3000) => {
    const start = Date.now();
    while (events.length === 0 && Date.now() - start < timeoutMs) {
      await sleep(50);
    }
    return events[0];
  };

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    [inquirer, owner, admin, adminOwner, stranger] = await Promise.all(
      [
        { name: 'Inquirer', email: 'msg-inquirer@example.com', password: 'password123', role: 'user' },
        { name: 'Owner', email: 'msg-owner@example.com', password: 'password123', role: 'agent' },
        { name: 'Admin', email: 'msg-admin@example.com', password: 'password123', role: 'admin' },
        { name: 'AdminOwner', email: 'msg-adminowner@example.com', password: 'password123', role: 'admin' },
        { name: 'Stranger', email: 'msg-stranger@example.com', password: 'password123', role: 'user' },
      ].map((u) => User.create(u))
    );

    thread = await Conversation.create({ inquirer: inquirer._id, owner: owner._id });
    adminOwnedThread = await Conversation.create({ inquirer: inquirer._id, owner: adminOwner._id });
    closedThread = await Conversation.create({
      inquirer: inquirer._id,
      owner: owner._id,
      isActive: false,
    });
    // Legacy row: bypass Mongoose validation to omit the required inquirer.
    await Conversation.collection.insertOne({
      owner: owner._id,
      messages: [],
      isActive: true,
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationRoutes);
    api = request(app);

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

  it('active conversation accepts a message and emits the persisted message', async () => {
    const ownerSocket = await connectSocket(owner);
    const ownerEvents = collect(ownerSocket);
    assert.equal((await joinRoom(ownerSocket, String(thread._id))).ok, true);

    const res = await sendMessage(inquirer, String(thread._id), 'hello owner');
    assert.equal(res.status, 200);

    const evt = await waitForEvent(ownerEvents);
    assert.ok(evt, 'expected a conversation.message event');
    assert.equal(evt.conversationId, String(thread._id));
    assert.equal(evt.isActive, true);

    const fresh = await Conversation.findById(thread._id);
    const persisted = fresh.messages.find((m) => m.body === 'hello owner');
    assert.ok(persisted, 'message must be persisted');
    assert.equal(evt.message._id, String(persisted._id));
    assert.equal(new Date(evt.message.createdAt).toISOString(), persisted.createdAt.toISOString());
    assert.equal(evt.message.body, 'hello owner');
    assert.equal(evt.message.side, 'inquirer');
    ownerSocket.disconnect();
  });

  it('owner-side sender id is masked for non-admin but full for admin', async () => {
    const inqSocket = await connectSocket(inquirer);
    const adminSocket = await connectSocket(admin);
    const inqEvents = collect(inqSocket);
    const adminEvents = collect(adminSocket);
    assert.equal((await joinRoom(inqSocket, String(thread._id))).ok, true);
    assert.equal((await joinRoom(adminSocket, String(thread._id))).ok, true);

    const res = await sendMessage(owner, String(thread._id), 'owner reply here');
    assert.equal(res.status, 200);

    const inqEvt = await waitForEvent(inqEvents);
    const adminEvt = await waitForEvent(adminEvents);
    assert.equal(inqEvt.message.side, 'owner');
    assert.ok(!('sender' in inqEvt.message), 'non-admin must not see owner sender id');
    assert.equal(inqEvt.message.senderName, inqEvt.message.senderName);
    assert.ok(inqEvt.message.body === 'owner reply here');
    assert.ok(adminEvt.message.sender, 'admin must receive the full sender');
    inqSocket.disconnect();
    adminSocket.disconnect();
  });

  it('admin who is also a participant receives the admin (full) representation', async () => {
    const adminSocket = await connectSocket(adminOwner);
    const inqSocket = await connectSocket(inquirer);
    const adminEvents = collect(adminSocket);
    const inqEvents = collect(inqSocket);
    assert.equal((await joinRoom(adminSocket, String(adminOwnedThread._id))).ok, true);
    assert.equal((await joinRoom(inqSocket, String(adminOwnedThread._id))).ok, true);

    const res = await sendMessage(adminOwner, String(adminOwnedThread._id), 'admin-owner reply');
    assert.equal(res.status, 200);

    const adminEvt = await waitForEvent(adminEvents);
    const inqEvt = await waitForEvent(inqEvents);
    assert.ok(adminEvt.message.sender, 'participant-admin must get full sender');
    assert.ok(!('sender' in inqEvt.message), 'inquirer must get masked payload');
    adminSocket.disconnect();
    inqSocket.disconnect();
  });

  it('inquirer-side sender stays visible to the owner (no over-masking)', async () => {
    const ownerSocket = await connectSocket(owner);
    const ownerEvents = collect(ownerSocket);
    await joinRoom(ownerSocket, String(thread._id));

    await sendMessage(inquirer, String(thread._id), 'visibility check');
    const evt = await waitForEvent(ownerEvents);
    assert.equal(evt.message.side, 'inquirer');
    assert.ok(evt.message.sender, 'inquirer-side sender must stay visible');
    ownerSocket.disconnect();
  });

  it('closed conversation returns 403 and emits nothing', async () => {
    const inqSocket = await connectSocket(inquirer);
    const events = collect(inqSocket);
    assert.equal((await joinRoom(inqSocket, String(closedThread._id))).ok, true);

    const before = (await Conversation.findById(closedThread._id)).messages.length;
    const res = await sendMessage(inquirer, String(closedThread._id), 'should be blocked');
    assert.equal(res.status, 403);
    assert.match(res.body.message, /closed/i);
    const after = (await Conversation.findById(closedThread._id)).messages.length;
    assert.equal(after, before);

    await sleep(500);
    assert.equal(events.length, 0, 'blocked write must not emit');
    inqSocket.disconnect();
  });

  it('unauthorized user still gets REST 403 and no event', async () => {
    const ownerSocket = await connectSocket(owner);
    const events = collect(ownerSocket);
    await joinRoom(ownerSocket, String(thread._id));

    const res = await sendMessage(stranger, String(thread._id), 'intruder msg');
    assert.equal(res.status, 403);
    await sleep(500);
    assert.equal(events.length, 0);
    ownerSocket.disconnect();
  });

  it('nonexistent conversation still 404s', async () => {
    const res = await sendMessage(inquirer, String(new mongoose.Types.ObjectId()), 'ghost');
    assert.equal(res.status, 404);
  });

  it('legacy missing-inquirer conversation still 409s', async () => {
    const legacy = await Conversation.findOne({ inquirer: { $exists: false } });
    assert.ok(legacy, 'legacy fixture must exist');
    const res = await sendMessage(owner, String(legacy._id), 'legacy msg');
    assert.equal(res.status, 409);
  });

  it('empty message still 400s', async () => {
    const res = await sendMessage(inquirer, String(thread._id), '   ');
    assert.equal(res.status, 400);
  });

  it('unrelated connected user receives nothing', async () => {
    const strangerSocket = await connectSocket(stranger);
    const strangerEvents = collect(strangerSocket);
    const ownerSocket = await connectSocket(owner);
    const ownerEvents = collect(ownerSocket);
    await joinRoom(ownerSocket, String(thread._id));

    await sendMessage(inquirer, String(thread._id), 'private hello');
    const evt = await waitForEvent(ownerEvents);
    assert.ok(evt);
    await sleep(500);
    assert.equal(strangerEvents.length, 0);
    strangerSocket.disconnect();
    ownerSocket.disconnect();
  });

  it('multiple sockets of the same user each receive exactly one event', async () => {
    const s1 = await connectSocket(inquirer);
    const s2 = await connectSocket(inquirer);
    const e1 = collect(s1);
    const e2 = collect(s2);
    await joinRoom(s1, String(thread._id));
    await joinRoom(s2, String(thread._id));

    await sendMessage(owner, String(thread._id), 'multi-tab hello');
    const [evt1, evt2] = await Promise.all([waitForEvent(e1), waitForEvent(e2)]);
    assert.ok(evt1 && evt2);
    assert.equal(evt1.message._id, evt2.message._id);
    await sleep(300);
    assert.equal(e1.length, 1, 'exactly one emit per socket');
    assert.equal(e2.length, 1, 'exactly one emit per socket');
    s1.disconnect();
    s2.disconnect();
  });

  it('emit helper never throws: null io and throwing io', async () => {
    const conv = await Conversation.findById(thread._id);
    const msg = conv.messages[conv.messages.length - 1];
    assert.equal(await emitConversationMessage(null, conv, msg), false);
    const badIO = {
      in: () => {
        throw new Error('transport down');
      },
    };
    assert.equal(await emitConversationMessage(badIO, conv, msg), false);
    assert.equal(await emitConversationMessage(getIO(), null, msg), false);
  });

  // NOTE: this test closes the realtime singleton and must stay last —
  // re-attaching a new Socket.IO server to the same HTTP server after
  // close() breaks Engine.IO polling, so no socket test may run after it.
  // (Production impact: none — close() is test-teardown-only; server.js
  // never closes and re-inits in one process.)
  it('REST send succeeds with realtime down (getIO null)', async () => {
    await close(); // simulate Socket.IO unavailable
    const res = await sendMessage(inquirer, String(thread._id), 'io-down hello');
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    const fresh = await Conversation.findById(thread._id);
    assert.ok(fresh.messages.some((m) => m.body === 'io-down hello'));
  });
});
