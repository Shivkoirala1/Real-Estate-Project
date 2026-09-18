const { CONVERSATION_STATUS } = require('./events');
const { conversationRoom, userRoom } = require('./rooms');

/**
 * Emit `v1.conversation.status` after a close/reopen REST mutation succeeds.
 *
 * Recipients (approved Phase 6 design):
 *  1. sockets in `conversation:<id>` (open views, including viewing admins)
 *  2. sockets in the participants' `user:<inquirerId>` / `user:<ownerId>`
 *     rooms (badge/list views that never joined the thread room)
 *
 * The union is deduplicated by socket id so a participant with the thread
 * open (member of both room types) receives exactly one event. The payload
 * carries no message content and needs no per-recipient masking:
 * `{ conversationId, isActive }`, with `isActive` taken from the persisted
 * document — never from client input.
 *
 * Failure contract (same as the message publisher): never throws, never
 * affects the REST response. Null io, empty rooms, and emit errors resolve
 * safely. Only safe metadata is logged: { conversationId, isActive }.
 *
 * @param {object|null} io Socket.IO server (getIO()) or null.
 * @param {object} conversation Persisted conversation document.
 * @returns {Promise<boolean>} true when delivery was attempted (or nobody
 *          was listening), false when skipped without io.
 */
const emitConversationStatus = async (io, conversation) => {
  try {
    if (!io || !conversation) return false;

    const conversationId = String(conversation._id);
    const payload = { conversationId, isActive: conversation.isActive };

    const rooms = [conversationRoom(conversationId)];
    if (conversation.inquirer) rooms.push(userRoom(conversation.inquirer));
    if (conversation.owner) rooms.push(userRoom(conversation.owner));

    const seen = new Set();
    for (const room of rooms) {
      const sockets = await io.in(room).fetchSockets();
      for (const sock of sockets) {
        if (seen.has(sock.id)) continue;
        seen.add(sock.id);
        io.to(sock.id).emit(CONVERSATION_STATUS, payload);
      }
    }
    return true;
  } catch (err) {
    try {
      console.error('Realtime status emit failed:', {
        conversationId: conversation && String(conversation._id),
        isActive: conversation && conversation.isActive,
        reason: err && err.message,
      });
    } catch (_) {
      // Logging must never break the REST response either.
    }
    return false;
  }
};

module.exports = { emitConversationStatus };
