const { CONVERSATION_MESSAGE } = require('./events');
const { conversationRoom } = require('./rooms');
const { maskSingleMessage } = require('./masking');

/**
 * Emit `v1.conversation.message` to the members of a conversation room.
 *
 * Called by `addMessage` AFTER `conversation.save()` (and sender populate)
 * succeeds — never before persistence. REST remains the source of truth;
 * this delivery is a hint the frontend dedupes by message `_id` (one emit
 * per connected socket, so no duplicates per recipient/tab).
 *
 * Per-recipient masking (approved Q2 strategy): each connected socket gets
 * the variant matching its verified role — admins (including admins who
 * are also participants) receive the full `sender`, everyone else receives
 * the REST-equivalent masked payload for owner-side messages. Sockets with
 * no verified identity default to the masked variant. Room membership
 * proves conversation access (Phase 4 authorization); masking additionally
 * depends on recipient role, never on room alone.
 *
 * Failure contract: never throws and never affects the REST response.
 * Null/missing io (realtime down), empty rooms, and emit errors all
 * resolve safely — the persisted message is always recoverable via REST.
 * Only safe metadata is logged: { conversationId, messageId, side }.
 *
 * @param {object|null} io Socket.IO server (getIO()) or null.
 * @param {object} conversation Persisted conversation document.
 * @param {object} persistedMessage The just-saved message subdocument.
 * @returns {Promise<boolean>} true when delivery was attempted (or there
 *          was nobody to deliver to), false when skipped without io.
 */
const emitConversationMessage = async (io, conversation, persistedMessage) => {
  try {
    if (!io || !conversation || !persistedMessage) return false;

    const room = conversationRoom(conversation._id);
    const sockets = await io.in(room).fetchSockets();
    if (sockets.length === 0) return true;

    const conversationId = String(conversation._id);
    const plain =
      persistedMessage && typeof persistedMessage.toObject === 'function'
        ? persistedMessage.toObject()
        : persistedMessage;

    for (const sock of sockets) {
      const isAdmin = sock.data && sock.data.user && sock.data.user.role === 'admin';
      const masked = maskSingleMessage(plain, isAdmin);
      io.to(sock.id).emit(CONVERSATION_MESSAGE, {
        conversationId,
        message: {
          _id: String(masked._id),
          sender: masked.sender,
          senderName: masked.senderName,
          side: masked.side,
          body: masked.body,
          createdAt: masked.createdAt,
        },
        isActive: conversation.isActive,
      });
    }
    return true;
  } catch (err) {
    // Safe metadata only — never the body, token, or sender identity.
    try {
      console.error('Realtime message emit failed:', {
        conversationId: conversation && String(conversation._id),
        messageId: persistedMessage && String(persistedMessage._id),
        side: persistedMessage && persistedMessage.side,
        reason: err && err.message,
      });
    } catch (_) {
      // Logging must never break the REST response either.
    }
    return false;
  }
};

module.exports = { emitConversationMessage };
