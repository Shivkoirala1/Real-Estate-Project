// Phase 3: Socket.IO handshake authentication tests.
// Run: node --test tests/realtime-auth.test.js
// Uses mongodb-memory-server (existing devDependency) + socket.io-client
// (devDependency, test harness only). No REST routes involved.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io: ioClient } = require('socket.io-client');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase3-test-secret';

const { init, getIO, close } = require('../realtime/io');
const { generateToken } = require('../utils/generateToken');
const User = require('../models/User');

describe('Phase 3 socket handshake auth', () => {
  let mongod;
  let httpServer;
  let port;
  let capturedServerSocket = null;

  const connect = (auth) =>
    new Promise((resolve) => {
      const socket = ioClient(`http://127.0.0.1:${port}`, {
        auth,
        reconnection: false,
        timeout: 5000,
      });
      socket.on('connect', () => resolve({ ok: true, socket }));
      socket.on('connect_error', (err) =>
        resolve({ ok: false, message: err.message, code: err.data && err.data.code })
      );
    });

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    httpServer = http.createServer();
    init(httpServer);
    getIO().on('connection', (s) => {
      capturedServerSocket = s;
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

  it('valid JWT connects and exposes verified server-side identity', async () => {
    const user = await User.create({
      name: 'Socket User',
      email: 'socket-valid@example.com',
      password: 'password123',
    });
    const { ok, socket } = await connect({ token: generateToken(user._id, user.role) });
    assert.equal(ok, true);
    assert.equal(capturedServerSocket.data.user._id, String(user._id));
    assert.equal(capturedServerSocket.data.user.role, 'user');
    assert.ok(!('token' in capturedServerSocket.data.user));
    socket.disconnect();
  });

  it('missing token is rejected', async () => {
    const res = await connect({});
    assert.equal(res.ok, false);
    assert.equal(res.code, 'UNAUTHORIZED');
  });

  it('malformed token is rejected', async () => {
    const res = await connect({ token: 'not-a-jwt' });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'UNAUTHORIZED');
  });

  it('wrong-secret token is rejected', async () => {
    const bad = jwt.sign({ id: 'x', role: 'user' }, 'wrong-secret');
    const res = await connect({ token: bad });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'UNAUTHORIZED');
  });

  it('expired JWT is rejected', async () => {
    const user = await User.create({
      name: 'Expired User',
      email: 'socket-expired@example.com',
      password: 'password123',
    });
    const expired = jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '-10s',
    });
    const res = await connect({ token: expired });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'UNAUTHORIZED');
  });

  it('nonexistent user is rejected', async () => {
    const ghost = new mongoose.Types.ObjectId();
    const res = await connect({ token: generateToken(ghost, 'user') });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'UNAUTHORIZED');
  });

  it('deactivated user is rejected with ACCOUNT_DISABLED', async () => {
    const user = await User.create({
      name: 'Disabled User',
      email: 'socket-disabled@example.com',
      password: 'password123',
      isActive: false,
    });
    const res = await connect({ token: generateToken(user._id, user.role) });
    assert.equal(res.ok, false);
    assert.equal(res.code, 'ACCOUNT_DISABLED');
  });

  it('JWT role claim is never trusted over the database role', async () => {
    const user = await User.create({
      name: 'Spoof User',
      email: 'socket-spoof@example.com',
      password: 'password123',
      role: 'user',
    });
    // Attacker crafts a validly-signed token claiming admin (same secret —
    // simulates a leaked/old token, not a forged signature).
    const spoofed = jwt.sign({ id: String(user._id), role: 'admin' }, process.env.JWT_SECRET);
    const { ok, socket } = await connect({ token: spoofed });
    assert.equal(ok, true);
    assert.equal(capturedServerSocket.data.user.role, 'user');
    socket.disconnect();
  });

  it('Bearer-prefixed token is accepted', async () => {
    const user = await User.create({
      name: 'Bearer User',
      email: 'socket-bearer@example.com',
      password: 'password123',
    });
    const { ok, socket } = await connect({
      token: `Bearer ${generateToken(user._id, user.role)}`,
    });
    assert.equal(ok, true);
    socket.disconnect();
  });
});
