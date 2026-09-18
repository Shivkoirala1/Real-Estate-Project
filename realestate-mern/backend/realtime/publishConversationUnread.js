const { getIO } = require('./io');
const { CONVERSATION_UNREAD } = require('./events');
const { userRoom } = require('./rooms');
const { countUnreadConversations } = require('./unreadCounts');

/**
 * Publish `v1.conversation.unread` for one user.
 *
 * Triggered only from conversation code paths whose persisted state can
 * change that user's `GET /conversations/unread-count` result:
 *  - addMessage → the OTHER participant (a new message can only make the
 *    other side's thread unread; the sender's own thread is read for them,
 *    non-participant admins always count 0)
 *  - getConversationById → the viewing participant (opening stamps
 *    lastReadAt, clearing the badge)
 *  - close/reopenConversation → both participants (closing drops the
 *    thread from the active-only count, reopening can restore it)
 *
 * The emitted count is authoritative, recomputed from MongoDB via the
 * Phase 1 shared helper — never a delta. Payload is exactly
 * `{ unreadCount }`, delivered to every connected socket of the user via
 * `user:<userId>` (multi-tab consistent, no cross-tab coordination).
 * This event is independent of `v1.notification.unread` (separate counter,
 * separate publisher); when one action changes both counters both events
 * legitimately fire, each from its own code path — never duplicated.
 *
 * Failure contract: never throws, never rejects. Null io, count-query
 * errors, and emit errors resolve `false` while the REST operation that
 * triggered the publish succeeds. Only safe metadata is logged.
 *
 * @param {string|object} userId User id (ObjectId or string).
 * @param {object} [ioOverride] Test seam: replaces getIO() when provided.
 * @returns {Promise<boolean>} true when emitted, false when skipped/failed.
 */
const publishConversationUnread = async (userId, ioOverride) => {
  try {
    if (!userId) return false;
    const io = ioOverride === undefined ? getIO() : ioOverride;
    if (!io) return false;

    const unreadCount = await countUnreadConversations(userId);
    io.to(userRoom(userId)).emit(CONVERSATION_UNREAD, { unreadCount });
    return true;
  } catch (err) {
    try {
      console.error('Realtime conversation-unread publish failed:', {
        user: String(userId),
        reason: err && err.message,
      });
    } catch (_) {
      // Logging must never break the triggering REST operation either.
    }
    return false;
  }
};

module.exports = { publishConversationUnread };
