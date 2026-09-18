// Phase 6: conversation close/reopen status events.
// Run: node --test tests/realtime-status.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io: ioClient } = require('socket.io-client');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase6-test-secret';

const { init, getIO, close } = require('../realtime/io');
const { CONVERSATION_STATUS } = require('../realtime/events');
const { emitConversationStatus } = require('../realtime/publishStatus');
const { generateToken } = require('../utils/generateToken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const conversationRoutes = require('../routes/conversationRoutes');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Phase 6 conversation.status', () => {
  let mongod;
  let app;
  let httpServer;
  let port;
  let api;

  let inquirer;
  let owner;
  let admin;
  let stranger;
  let threadA; // active -> close flow
  let threadB; // closed -> reopen flow
  let threadC; // active -> negative close tests (stays active)
  let threadD; // closed -> negative reopen tests + regression (stays closed until regression)

  const tokenFor = (user) => generateToken(user._id, user.role);

  const call = (user, method, path, body) => {
    let req = request(app)[method](path).set('Authorization', `Bearer ${tokenFor(user)}`);
    if (body) req = req.send(body);
    return req;
  };
  const closeThread = (user, id) => call(user, 'patch', `/api/conversations/${id}/close`);
  const reopenThread = (user, id) => call(user, 'patch', `/api/conversations/${id}/reopen`);

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
    socket.on(CONVERSATION_STATUS, (payload) => events.push(payload));
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

    [inquirer, owner, admin, stranger] = await Promise.all(
      [
        { name: 'Inquirer', email: 'st-inquirer@example.com', password: 'password123', role: 'user' },
        { name: 'Owner', email: 'st-owner@example.com', password: 'password123', role: 'agent' },
        { name: 'Admin', email: 'st-admin@example.com', password: 'password123', role: 'admin' },
        { name: 'Stranger', email: 'st-stranger@example.com', password: 'password123', role: 'user' },
      ].map((u) => User.create(u))
    );

    [threadA, threadB, threadC, threadD] = await Promise.all([
      Conversation.create({ inquirer: inquirer._id, owner: owner._id }),
      Conversation.create({ inquirer: inquirer._id, owner: owner._id, isActive: false }),
      Conversation.create({ inquirer: inquirer._id, owner: owner._id }),
      Conversation.create({ inquirer: inquirer._id, owner: owner._id, isActive: false }),
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

  it('authorized close persists isActive=false and notifies room + user rooms exactly once', async () => {
    const inqJoined = await connectSocket(inquirer);
    const inqUserOnly = await connectSocket(inquirer);
    const ownerUserOnly = await connectSocket(owner);
    const strangerSocket = await connectSocket(stranger);
    const joinedEvents = collect(inqJoined);
    const userOnlyEvents = collect(inqUserOnly);
    const ownerEvents = collect(ownerUserOnly);
    const strangerEvents = collect(strangerSocket);
    assert.equal((await joinRoom(inqJoined, String(threadA._id))).ok, true);
    // ownerUserOnly / inqUserOnly stay out of the thread room: user-room path.

    const res = await closeThread(owner, String(threadA._id));
    assert.equal(res.status, 200);
    assert.equal((await Conversation.findById(threadA._id)).isActive, false);

    const [e1, e2, e3] = await Promise.all([
      waitForEvent(joinedEvents),
      waitForEvent(userOnlyEvents),
      waitForEvent(ownerEvents),
    ]);
    for (const evt of [e1, e2, e3]) {
      assert.equal(evt.conversationId, String(threadA._id));
      assert.equal(evt.isActive, false);
      assert.deepEqual(Object.keys(evt).sort(), ['conversationId', 'isActive']);
    }
    await sleep(400);
    // Joined socket is in both room types: deduped to exactly one event.
    assert.equal(joinedEvents.length, 1);
    assert.equal(userOnlyEvents.length, 1);
    assert.equal(ownerEvents.length, 1);
    assert.equal(strangerEvents.length, 0);
    inqJoined.disconnect();
    inqUserOnly.disconnect();
    ownerUserOnly.disconnect();
    strangerSocket.disconnect();
  });

  it('unauthorized close mutates nothing and emits nothing', async () => {
    const inqSocket = await connectSocket(inquirer);
    const events = collect(inqSocket);
    await joinRoom(inqSocket, String(threadC._id));

    const res = await closeThread(inquirer, String(threadC._id)); // only admin/owner may close
    assert.equal(res.status, 403);
    assert.equal((await Conversation.findById(threadC._id)).isActive, true);
    await sleep(500);
    assert.equal(events.length, 0);
    inqSocket.disconnect();
  });

  it('close of nonexistent conversation 404s and emits nothing', async () => {
    const inqSocket = await connectSocket(inquirer);
    const events = collect(inqSocket);
    const res = await closeThread(owner, String(new mongoose.Types.ObjectId()));
    assert.equal(res.status, 404);
    await sleep(400);
    assert.equal(events.length, 0);
    inqSocket.disconnect();
  });

  it('authorized reopen persists isActive=true and notifies room + user rooms', async () => {
    const inqJoined = await connectSocket(inquirer);
    const ownerUserOnly = await connectSocket(owner);
    const joinedEvents = collect(inqJoined);
    const ownerEvents = collect(ownerUserOnly);
    assert.equal((await joinRoom(inqJoined, String(threadB._id))).ok, true);

    const res = await reopenThread(admin, String(threadB._id));
    assert.equal(res.status, 200);
    assert.equal((await Conversation.findById(threadB._id)).isActive, true);

    const [e1, e2] = await Promise.all([waitForEvent(joinedEvents), waitForEvent(ownerEvents)]);
    assert.equal(e1.isActive, true);
    assert.equal(e2.isActive, true);
    assert.equal(e1.conversationId, String(threadB._id));
    inqJoined.disconnect();
    ownerUserOnly.disconnect();
  });

  it('unauthorized reopen mutates nothing and emits nothing', async () => {
    const ownerSocket = await connectSocket(owner);
    const events = collect(ownerSocket);
    await joinRoom(ownerSocket, String(threadD._id));

    const res = await reopenThread(owner, String(threadD._id)); // admin-only route
    assert.equal(res.status, 403);
    assert.equal((await Conversation.findById(threadD._id)).isActive, false);
    await sleep(500);
    assert.equal(events.length, 0);
    ownerSocket.disconnect();
  });

  it('reopen of nonexistent conversation 404s and emits nothing', async () => {
    const res = await reopenThread(admin, String(new mongoose.Types.ObjectId()));
    assert.equal(res.status, 404);
  });

  it('closed-thread regression: readable, joinable, send 403, reopen restores send', async () => {
    // Readable while closed.
    const get = await call(inquirer, 'get', `/api/conversations/${threadD._id}`);
    assert.equal(get.status, 200);
    assert.equal(get.body.conversation.isActive, false);

    // Joinable while closed.
    const socket = await connectSocket(inquirer);
    const joinAck = await joinRoom(socket, String(threadD._id));
    assert.equal(joinAck.ok, true);
    assert.equal(joinAck.isActive, false);

    // Send blocked (Phase 5 guard).
    const blocked = await call(
      inquirer,
      'patch',
      `/api/conversations/${threadD._id}/messages`,
      { message: 'still closed' }
    );
    assert.equal(blocked.status, 403);

    // Reopen restores send.
    assert.equal((await reopenThread(admin, String(threadD._id))).status, 200);
    const sent = await call(
      inquirer,
      'patch',
      `/api/conversations/${threadD._id}/messages`,
      { message: 'open again' }
    );
    assert.equal(sent.status, 200);
    socket.disconnect();
  });

  it('emit helper never throws: null io, null conversation, throwing io', async () => {
    const conv = await Conversation.findById(threadA._id);
    assert.equal(await emitConversationStatus(null, conv), false);
    assert.equal(await emitConversationStatus(getIO(), null), false);
    const badIO = {
      in: () => {
        throw new Error('transport down');
      },
    };
    assert.equal(await emitConversationStatus(badIO, conv), false);
  });

  // NOTE: closes the realtime singleton; must stay last in this file (see
  // the Phase 5 suite note on close()+re-init).
  it('close/reopen succeed with realtime down', async () => {
    await close();
    const closed = await closeThread(owner, String(threadC._id));
    assert.equal(closed.status, 200);
    assert.equal((await Conversation.findById(threadC._id)).isActive, false);
    const reopened = await reopenThread(admin, String(threadC._id));
    assert.equal(reopened.status, 200);
    assert.equal((await Conversation.findById(threadC._id)).isActive, true);
  });
});
