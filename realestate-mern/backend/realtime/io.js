const { Server } = require('socket.io');
const { socketAuth } = require('../middleware/socketAuth');
const { joinUserRoom, registerConversationHandlers } = require('./rooms');

/**
 * Socket.IO server singleton for realtime delivery (server -> client only).
 *
 * Phase 2: foundation only — attaches Socket.IO to the existing Express
 * HTTP server with the same CORS origin rule as REST. No authentication
 * (Phase 3), no rooms (Phase 4), no application events (Phases 5-8).
 *
 * Phase 3: JWT handshake authentication via socketAuth (mirrors REST
 * `protect`). Every connection — including reconnects, for which
 * Socket.IO re-runs this middleware — must present a valid token for a
 * live, active user. No rooms or application events yet.
 *
 * Phase 4: room model. Each authenticated connection auto-joins its own
 * `user:<userId>` room (id from verified socket.data.user only) and gets
 * `conversation.join` / `conversation.leave` handlers, whose join path
 * re-checks the REST participant-or-admin rule per conversation.
 * No application events yet.
 *
 * `getIO()` returns null before init() or after close(), so realtime
 * publishers must no-op when realtime is unavailable — REST and
 * notification persistence must never break over a socket failure.
 */

let io = null;

/**
 * Attach Socket.IO to an existing HTTP server. Safe to call once; later
 * calls return the existing instance. Any failure is caught by the caller
 * (server.js) so boot can continue in degraded REST-only mode.
 */
const init = (httpServer) => {
  if (io) return io;

  io = new Server(httpServer, {
    cors: {
      // Same single-origin rule as the REST API
      // (server.js: cors({ origin: CLIENT_ORIGIN || CLIENT_URL })).
      origin: process.env.CLIENT_ORIGIN || process.env.CLIENT_URL,
    },
  });

  // Phase 3: authenticate every handshake (and every reconnect) before the
  // connection is established. Verified identity lands on socket.data.user.
  io.use(socketAuth);

  // Phase 4: room wiring. Auto-join the private user room, then register
  // the authorized conversation join/leave handlers.
  io.on('connection', (socket) => {
    joinUserRoom(socket);
    registerConversationHandlers(socket);
  });

  return io;
};

const getIO = () => io;

const close = async () => {
  if (!io) return;
  await io.close();
  io = null;
};

module.exports = { init, getIO, close };
