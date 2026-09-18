// Phase 11: end-to-end realtime reliability tests.
// Simulates the Phase 9 frontend contract (append-with-dedupe, resync on
// reconnect) against the real Express + Socket.IO stack.
// Run: node --test tests/realtime-e2e.test.js
const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { io: ioClient } = require('socket.io-client');
const request = require('supertest');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'phase11-test-secret';

const { init, close } = require('../realtime/io');
const { CONVERSATION_UNREAD, CONVERSATION_MESSAGE, NOTIFICATION_UNREAD } = require('../realtime/events');
const { generateToken } = require('../utils/generateToken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const conversationRoutes = require('../routes/conversationRoutes');
const notificationRoutes = require('../routes/notificationRoutes');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tracks every connected client so a failing test can't leak open sockets
// (leaked sockets keep httpServer.close() hanging in teardown).
const liveClients = new Set();

/**
 * Simulated Phase 9 frontend client: user-room auto-join, thread join,
 * message append with _id dedupe, status patch, unread replace-on-event,
 * and explicit resync() mirroring onSocketConnect handlers.
 */
class TestClient {
  constructor(api, port, user = null) {
    this.api = api;
    this.port = port;
    this.user = user;
    this.socket = null;
    this.unreadConv = null;
    this.unreadNotif = null;
    this.threads = {}; // id -> messages[]
    this.threadActive = {};
  }

  async connect(user = this.user) {
    this.user = user;
    this.socket = ioClient(`http://127.0.0.1:${this.port}`, {
      auth: { token: generateToken(user._id, user.role) },
      reconnection: false,
      timeout: 5000,
    });
    await new Promise((resolve, reject) => {
      this.socket.on('connect', resolve);
      this.socket.on('connect_error', (e) => reject(new Error(`connect failed: ${e.message}`)));
    });
    this.socket.on(CONVERSATION_UNREAD, (p) => {
      if (p && typeof p.unreadCount === 'number') this.unreadConv = p.unreadCount;
    });
    this.socket.on(NOTIFICATION_UNREAD, (p) => {
      if (p && typeof p.unreadCount === 'number') this.unreadNotif = p.unreadCount;
    });
    this.socket.on(CONVERSATION_MESSAGE, (p) => {
      if (!p || !p.message || !p.message._id) return;
      const cur = this.threads[p.conversationId] || [];
      if (cur.some((m) => String(m._id) === String(p.message._id))) return;
      this.threads[p.conversationId] = [...cur, p.message];
    });
    this.socket.on('v1.conversation.status', (p) => {
      if (!p || typeof p.isActive !== 'boolean') return;
      this.threadActive[p.conversationId] = p.isActive;
    });
    liveClients.add(this);
    return this.socket;
  }

  join(conversationId) {
    return new Promise((resolve) => {
      this.socket.emit('conversation.join', { conversationId }, (ack) => resolve(ack));
    });
  }

  authed(method, path, body) {
    let req = request(this.api)[method](path).set(
      'Authorization',
      `Bearer ${generateToken(this.user._id, this.user.role)}`
    );
    if (body) req = req.send(body);
    return req;
  }

  async resync(openThreadId) {
    // Mirrors the Phase 9 onSocketConnect handlers: counts + history + rejoin.
    const convRes = await this.authed('get', '/api/conversations/unread-count');
    this.unreadConv = convRes.body.unreadCount;
    const notifRes = await this.authed('get', '/api/notifications/unread-count');
    this.unreadNotif = notifRes.body.unreadCount;
    if (openThreadId) {
      await this.join(openThreadId);
      const t = await this.authed('get', `/api/conversations/${openThreadId}`);
      this.threads[openThreadId] = t.body.conversation.messages;
      this.threadActive[openThreadId] = t.body.conversation.isActive;
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    liveClients.delete(this);
  }
}

const waitFor = async (fn, timeoutMs = 3000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const v = fn();
    if (v) return v;
    await sleep(50);
  }
  return fn();
};

describe('Phase 11 realtime E2E reliability', () => {
  let mongod;
  let app;
  let httpServer;
  let port;

  let alice;
  let bob;
  let admin;
  let thread;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    [alice, bob, admin] = await Promise.all(
      [
        { name: 'Alice', email: 'e2e-alice@example.com', password: 'password123', role: 'user' },
        { name: 'Bob', email: 'e2e-bob@example.com', password: 'password123', role: 'agent' },
        { name: 'Admin', email: 'e2e-admin@example.com', password: 'password123', role: 'admin' },
      ].map((u) => User.create(u))
    );
    thread = await Conversation.create({ inquirer: alice._id, owner: bob._id });

    app = express();
    app.use(express.json());
    app.use('/api/conversations', conversationRoutes);
    app.use('/api/notifications', notificationRoutes);

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

  afterEach(() => {
    for (const c of [...liveClients]) c.disconnect();
  });

  it('two-user live chat: delivery, badges, open-marks-read, no sender echo', async () => {
    const a = new TestClient(app, port);
    const b = new TestClient(app, port);
    await a.connect(alice);
    await b.connect(bob);
    await b.join(String(thread._id));

    // Alice sends via REST (returns full thread, like the real UI).
    const sendRes = await a.authed('patch', `/api/conversations/${thread._id}/messages`, {
      message: 'hi bob',
    });
    assert.equal(sendRes.status, 200);
    const restMessages = sendRes.body.conversation.messages;

    // Bob receives without refresh; alice gets no unread increment.
    const got = await waitFor(() => b.threads[String(thread._id)]?.find((m) => m.body === 'hi bob'));
    assert.ok(got, 'bob receives the message live');
    await sleep(400);
    assert.equal(a.unreadConv, null, 'sender gets no unread event');

    // Bob's badge converges to REST.
    const bobRest = await b.authed('get', '/api/conversations/unread-count');
    assert.equal(b.unreadConv, bobRest.body.unreadCount);
    assert.equal(b.unreadConv, 1);

    // Merge check: REST thread + live event dedupe == DB (sender-side race).
    const db = await Conversation.findById(thread._id);
    const merged = new Map(restMessages.map((m) => [String(m._id), m]));
    for (const m of b.threads[String(thread._id)] || []) merged.set(String(m._id), m);
    assert.equal(merged.size, db.messages.length, 'no duplicates across REST+event');

    // Bob opens the thread -> read stamp -> badge clears.
    const openRes = await b.authed('get', `/api/conversations/${thread._id}`);
    assert.equal(openRes.status, 200);
    const cleared = await waitFor(() => (b.unreadConv === 0 ? true : null));
    assert.ok(cleared, 'opening marks read and badge clears');
    a.disconnect();
    b.disconnect();
  });

  it('multi-tab: two sockets same user receive identical counts', async () => {
    const b1 = new TestClient(app, port);
    const b2 = new TestClient(app, port);
    const a = new TestClient(app, port);
    await b1.connect(bob);
    await b2.connect(bob);
    await a.connect(alice);

    await a.authed('patch', `/api/conversations/${thread._id}/messages`, { message: 'tab ping' });
    const [c1, c2] = await Promise.all([
      waitFor(() => (b1.unreadConv !== null ? b1.unreadConv : null)),
      waitFor(() => (b2.unreadConv !== null ? b2.unreadConv : null)),
    ]);
    assert.equal(c1, c2);
    const rest = await b1.authed('get', '/api/conversations/unread-count');
    assert.equal(c1, rest.body.unreadCount);
    a.disconnect();
    b1.disconnect();
    b2.disconnect();
  });

  it('rapid messages: 5 sends converge, unique events, counts authoritative', async () => {
    const b = new TestClient(app, port);
    const a = new TestClient(app, port);
    await b.connect(bob);
    await a.connect(alice);
    const joinAck = await b.join(String(thread._id));
    assert.equal(joinAck.ok, true);
    const seen = new Set();
    b.socket.on(CONVERSATION_MESSAGE, (p) => {
      if (p && p.conversationId === String(thread._id)) seen.add(String(p.message._id));
    });

    for (let i = 0; i < 5; i++) {
      const r = await a.authed('patch', `/api/conversations/${thread._id}/messages`, {
        message: `burst ${i}`,
      });
      assert.equal(r.status, 200);
    }
    await waitFor(() => (seen.size === 5 ? true : null), 5000);
    assert.equal(seen.size, 5, 'exactly 5 unique message events');
    const rest = await b.authed('get', '/api/conversations/unread-count');
    const converged = await waitFor(() => (b.unreadConv === rest.body.unreadCount ? true : null));
    assert.ok(converged, 'badge converges to REST after burst');
    a.disconnect();
    b.disconnect();
  });

  it('reconnect: missed messages + counts converge via resync, live resumes', async () => {
    const b = new TestClient(app, port);
    const a = new TestClient(app, port);
    await b.connect(bob);
    await a.connect(alice);
    await b.join(String(thread._id));
    await b.resync(String(thread._id));
    const baseline = b.unreadConv;

    // Network drop.
    b.disconnect();
    await a.authed('patch', `/api/conversations/${thread._id}/messages`, { message: 'missed 1' });
    await a.authed('patch', `/api/conversations/${thread._id}/messages`, { message: 'missed 2' });

    // Reconnect + resync (mirrors onSocketConnect).
    await b.connect(bob);
    await b.resync(String(thread._id));
    const db = await Conversation.findById(thread._id);
    assert.equal(b.threads[String(thread._id)].length, db.messages.length, 'history converges');
    const rest = await b.authed('get', '/api/conversations/unread-count');
    assert.equal(b.unreadConv, rest.body.unreadCount, 'counts converge');
    assert.ok(b.unreadConv >= baseline, 'no stale reset');

    // Live delivery resumes after resync.
    await a.authed('patch', `/api/conversations/${thread._id}/messages`, { message: 'aftermath' });
    const live = await waitFor(() =>
      b.threads[String(thread._id)]?.find((m) => m.body === 'aftermath')
    );
    assert.ok(live, 'live delivery resumes post-reconnect');
    a.disconnect();
    b.disconnect();
  });

  it('auth lifecycle: bad token rejected repeatedly without server damage; relogin works; REST 401 intact', async () => {
    const badConnect = () =>
      new Promise((resolve) => {
        const s = ioClient(`http://127.0.0.1:${port}`, {
          auth: { token: 'garbage' },
          reconnection: false,
          timeout: 3000,
        });
        s.on('connect', () => resolve('UNEXPECTED'));
        s.on('connect_error', (e) => resolve(e.message));
      });
    // Three rejected attempts: server stays healthy (no state leak/crash).
    for (let i = 0; i < 3; i++) {
      const msg = await badConnect();
      assert.match(msg, /Not authorized/);
    }
    // REST 401 handling intact.
    const anon = await request(app).get('/api/conversations/unread-count');
    assert.equal(anon.status, 401);
    // Fresh login connects cleanly.
    const b = new TestClient(app, port);
    await b.connect(bob);
    assert.ok(b.socket.connected);
    b.disconnect();
  });

  it('read op emits exactly one unread event; status events stay separate', async () => {
    const b = new TestClient(app, port);
    await b.connect(bob);
    let unreadCount = 0;
    let statusCount = 0;
    b.socket.on(CONVERSATION_UNREAD, () => unreadCount++);
    b.socket.on('v1.conversation.status', () => statusCount++);

    await b.authed('get', `/api/conversations/${thread._id}`);
    await sleep(600);
    assert.equal(unreadCount, 1, 'one read -> one unread event, no duplicates');
    assert.equal(statusCount, 0, 'read emits no status event');
    b.disconnect();
  });

  // NOTE: closes the realtime singleton; must stay last in this file.
  it('socket down: REST send/open/close/reopen all succeed', async () => {
    await close();
    // REST-only clients (never connect a socket).
    const a = new TestClient(app, port, alice);
    const b = new TestClient(app, port, bob);
    const adminClient = new TestClient(app, port, admin);
    const sendRes = await a.authed('patch', `/api/conversations/${thread._id}/messages`, {
      message: 'dark msg',
    });
    assert.equal(sendRes.status, 200);
    assert.equal((await a.authed('get', `/api/conversations/${thread._id}`)).status, 200);
    assert.equal((await b.authed('patch', `/api/conversations/${thread._id}/close`)).status, 200);
    assert.equal(
      (await adminClient.authed('patch', `/api/conversations/${thread._id}/reopen`)).status,
      200
    );
    const fresh = await Conversation.findById(thread._id);
    assert.equal(fresh.isActive, true);
    assert.ok(fresh.messages.some((m) => m.body === 'dark msg'));
  });
});
