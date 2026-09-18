// Phase 4: Socket.IO room model + authorization tests.
// Run: node --test tests/realtime-rooms.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io: ioClient } = require('socket.io-client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase4-test-secret';

const { init, getIO, close } = require('../realtime/io');
const { userRoom, conversationRoom } = require('../realtime/rooms');
const { generateToken } = require('../utils/generateToken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');

describe('Phase 4 rooms & authorization', () => {
  let mongod;
  let httpServer;
  let port;
  let lastServerSocket = null;

  let inquirer;
  let owner;
  let admin;
  let stranger;
  let thread;
  let closedThread;

  const connect = (user) =>
    new Promise((resolve) => {
      const socket = ioClient(`http://127.0.0.1:${port}`, {
        auth: { token: generateToken(user._id, user.role) },
        reconnection: false,
        timeout: 5000,
      });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', (err) => {
        throw new Error(`connect failed: ${err.message}`);
      });
    });

  const join = (socket, payload) =>
    new Promise((resolve) => {
      socket.emit('conversation.join', payload, (ack) => resolve(ack));
    });

  const leave = (socket, payload) =>
    new Promise((resolve) => {
      socket.emit('conversation.leave', payload, (ack) => resolve(ack));
    });

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    [inquirer, owner, admin, stranger] = await Promise.all(
      [
        { name: 'Inquirer', email: 'room-inquirer@example.com', password: 'password123', role: 'user' },
        { name: 'Owner', email: 'room-owner@example.com', password: 'password123', role: 'agent' },
        { name: 'Admin', email: 'room-admin@example.com', password: 'password123', role: 'admin' },
        { name: 'Stranger', email: 'room-stranger@example.com', password: 'password123', role: 'user' },
      ].map((u) => User.create(u))
    );

    thread = await Conversation.create({ inquirer: inquirer._id, owner: owner._id });
    closedThread = await Conversation.create({
      inquirer: inquirer._id,
      owner: owner._id,
      isActive: false,
    });

    httpServer = http.createServer();
    init(httpServer);
    getIO().on('connection', (s) => {
      lastServerSocket = s;
    });
    await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    port = httpServer.address().port;
  });

  after(async () => {
    await close();
    await new Promise((resolve) => httpServer.close(resolve));
    await mongoose.disconnect();
    await mongod.stop();
  });

  it('authenticated socket automatically joins its own user room', async () => {
    const socket = await connect(inquirer);
    assert.ok(lastServerSocket.rooms.has(userRoom(inquirer._id)));
    assert.equal(lastServerSocket.rooms.has(userRoom(owner._id)), false);
    socket.disconnect();
  });

  it('inquirer can join own conversation', async () => {
    const socket = await connect(inquirer);
    const ack = await join(socket, { conversationId: String(thread._id) });
    assert.equal(ack.ok, true);
    assert.equal(ack.conversationId, String(thread._id));
    assert.equal(ack.isActive, true);
    assert.ok(lastServerSocket.rooms.has(conversationRoom(thread._id)));
    socket.disconnect();
  });

  it('owner can join own conversation', async () => {
    const socket = await connect(owner);
    const ack = await join(socket, { conversationId: String(thread._id) });
    assert.equal(ack.ok, true);
    socket.disconnect();
  });

  it('admin can join a conversation they do not participate in', async () => {
    const socket = await connect(admin);
    const ack = await join(socket, { conversationId: String(thread._id) });
    assert.equal(ack.ok, true);
    socket.disconnect();
  });

  it('unrelated user cannot join the conversation', async () => {
    const socket = await connect(stranger);
    const ack = await join(socket, { conversationId: String(thread._id) });
    assert.equal(ack.ok, false);
    assert.equal(ack.code, 'FORBIDDEN');
    assert.equal(lastServerSocket.rooms.has(conversationRoom(thread._id)), false);
    socket.disconnect();
  });

  it('nonexistent conversation cannot be joined', async () => {
    const socket = await connect(inquirer);
    const ack = await join(socket, { conversationId: String(new mongoose.Types.ObjectId()) });
    assert.equal(ack.ok, false);
    assert.equal(ack.code, 'NOT_FOUND');
    socket.disconnect();
  });

  it('malformed conversation id cannot be joined', async () => {
    const socket = await connect(inquirer);
    const ack = await join(socket, { conversationId: 'not-an-id' });
    assert.equal(ack.ok, false);
    assert.equal(ack.code, 'INVALID_ID');
    socket.disconnect();
  });

  it('closed conversation can still be joined (readable + status)', async () => {
    const socket = await connect(inquirer);
    const ack = await join(socket, { conversationId: String(closedThread._id) });
    assert.equal(ack.ok, true);
    assert.equal(ack.isActive, false);
    assert.ok(lastServerSocket.rooms.has(conversationRoom(closedThread._id)));
    socket.disconnect();
  });

  it("client cannot join another user's private room or bypass auth with spoofed fields", async () => {
    const socket = await connect(stranger);
    // Attempt 1: pass another user's id/role alongside the request.
    const spoofed = await join(socket, {
      conversationId: String(thread._id),
      userId: String(inquirer._id),
      role: 'admin',
    });
    assert.equal(spoofed.ok, false);
    assert.equal(spoofed.code, 'FORBIDDEN');
    // Attempt 2: use a user-room name where a conversation id belongs.
    const roomSmuggle = await join(socket, { conversationId: userRoom(owner._id) });
    assert.equal(roomSmuggle.ok, false);
    // Private room of the other user was never joined; own room intact.
    assert.equal(lastServerSocket.rooms.has(userRoom(owner._id)), false);
    assert.ok(lastServerSocket.rooms.has(userRoom(stranger._id)));
    socket.disconnect();
  });

  it('leave works and is idempotent', async () => {
    const socket = await connect(inquirer);
    await join(socket, { conversationId: String(thread._id) });
    assert.ok(lastServerSocket.rooms.has(conversationRoom(thread._id)));
    const left = await leave(socket, { conversationId: String(thread._id) });
    assert.equal(left.ok, true);
    assert.equal(lastServerSocket.rooms.has(conversationRoom(thread._id)), false);
    // Leaving again (or without ever joining) still acks ok.
    const leftAgain = await leave(socket, { conversationId: String(thread._id) });
    assert.equal(leftAgain.ok, true);
    socket.disconnect();
  });

  it('join ack exposes no message contents', async () => {
    const socket = await connect(inquirer);
    const ack = await join(socket, { conversationId: String(thread._id) });
    assert.deepEqual(Object.keys(ack).sort(), ['conversationId', 'isActive', 'ok']);
    socket.disconnect();
  });
});
