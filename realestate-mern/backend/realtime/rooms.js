const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');

/**
 * Socket.IO room model (Phase 4).
 *
 * - `user:<userId>` — private per-user room for badge events. Joined
 *   automatically on every authenticated connection from
 *   `socket.data.user` (set by the Phase 3 handshake middleware). There is
 *   intentionally NO client event that joins a user room.
 * - `conversation:<conversationId>` — per-thread room for live message /
 *   status events. Joined only via `conversation.join`, which re-checks the
 *   exact authorization triple from REST `getConversationById`
 *   (controllers/conversationController.js): inquirer OR owner OR admin.
 *
 * Joining a room never exposes conversation contents — the join ack carries
 * only `{ conversationId, isActive }`. History always comes from REST.
 * Closed threads remain joinable (readable + status updates); the
 * closed-thread send guard lands in Phase 5 with `addMessage`.
 */

const userRoom = (userId) => `user:${String(userId)}`;

const conversationRoom = (conversationId) => `conversation:${String(conversationId)}`;

// Light join-rate guard: a socket bursting joins is either buggy or abusive.
const JOIN_LIMIT = 20;
const JOIN_WINDOW_MS = 10 * 1000;

const checkJoinRate = (socket) => {
  const now = Date.now();
  const recent = (socket.data.joinAttempts || []).filter((t) => now - t < JOIN_WINDOW_MS);
  recent.push(now);
  socket.data.joinAttempts = recent;
  return recent.length <= JOIN_LIMIT;
};

/**
 * DB-backed authorization for a conversation room. Mirrors REST
 * `getConversationById`: participant (inquirer/owner) or admin. Returns
 * `{ ok: true, conversation }` or `{ ok: false, code, message }`.
 * Never throws — invalid IDs and DB errors become ack payloads.
 */
const authorizeConversation = async (user, conversationId) => {
  if (!user) {
    return { ok: false, code: 'UNAUTHORIZED', message: 'Not authorized' };
  }
  if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
    return { ok: false, code: 'INVALID_ID', message: 'Invalid conversation id' };
  }
  let conversation;
  try {
    conversation = await Conversation.findById(conversationId).select('inquirer owner isActive');
  } catch (err) {
    return { ok: false, code: 'NOT_FOUND', message: 'Conversation not found' };
  }
  if (!conversation) {
    return { ok: false, code: 'NOT_FOUND', message: 'Conversation not found' };
  }
  const userId = String(user._id);
  const isInquirer = String(conversation.inquirer) === userId;
  const isOwner = String(conversation.owner) === userId;
  const isAdmin = user.role === 'admin';
  if (!isAdmin && !isInquirer && !isOwner) {
    return { ok: false, code: 'FORBIDDEN', message: 'You are not authorized to view this conversation' };
  }
  return { ok: true, conversation };
};

/**
 * Auto-join the socket's own private room. The id comes only from the
 * verified handshake identity — there is no client-controlled equivalent.
 */
const joinUserRoom = (socket) => {
  const user = socket.data && socket.data.user;
  if (!user) return;
  socket.join(userRoom(user._id));
};

const toAck = (payload, ack) => {
  if (typeof ack === 'function') ack(payload);
};

/**
 * Register `conversation.join` / `conversation.leave` on an authenticated
 * socket. Join authorizes via authorizeConversation; leave is idempotent
 * and only affects the caller's own membership.
 */
const registerConversationHandlers = (socket) => {
  socket.on('conversation.join', async (payload, ack) => {
    const conversationId = payload && payload.conversationId;
    // Extra client fields (userId, role, …) are ignored by design — only
    // socket.data.user is trusted.
    if (!checkJoinRate(socket)) {
      return toAck({ ok: false, code: 'RATE_LIMITED', message: 'Too many join attempts' }, ack);
    }
    const result = await authorizeConversation(socket.data && socket.data.user, conversationId);
    if (!result.ok) {
      return toAck({ ok: false, code: result.code, message: result.message }, ack);
    }
    socket.join(conversationRoom(result.conversation._id));
    return toAck(
      {
        ok: true,
        conversationId: String(result.conversation._id),
        isActive: result.conversation.isActive,
      },
      ack
    );
  });

  socket.on('conversation.leave', (payload, ack) => {
    const conversationId = payload && payload.conversationId;
    if (conversationId && mongoose.Types.ObjectId.isValid(conversationId)) {
      socket.leave(conversationRoom(conversationId));
    }
    return toAck(
      { ok: true, conversationId: conversationId ? String(conversationId) : null },
      ack
    );
  });
};

module.exports = {
  userRoom,
  conversationRoom,
  authorizeConversation,
  joinUserRoom,
  registerConversationHandlers,
};
