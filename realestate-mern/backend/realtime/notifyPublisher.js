const { getIO } = require('./io');
const { NOTIFICATION_UNREAD } = require('./events');
const { userRoom } = require('./rooms');
const { countUnreadNotifications } = require('./unreadCounts');

/**
 * Publish `v1.notification.unread` for a freshly persisted notification.
 *
 * Called from inside notify() (utils/notify.js) immediately after
 * Notification.create() succeeds — the single choke point every domain
 * (controllers, lead auto-conversion, cron reminders) flows through, so no
 * call site needs its own socket code. notifyMany() inherits the behavior
 * per recipient, including its deduplication (one create → one publish).
 *
 * The emitted count is authoritative, recomputed from MongoDB via the
 * Phase 1 shared helper — never previous+1, never a client delta.
 * Payload contains exactly `{ unreadCount }`: no title, body, sender, or
 * token. Target is the recipient's private `user:<recipientId>` room.
 *
 * Failure contract: never throws, never rejects. Null io (realtime down),
 * count-query errors, and emit errors all resolve `false` while the
 * already-persisted notification — and the caller's request — succeed.
 * This also keeps fire-and-forget notify() callers (no await) safe: no
 * unhandled rejection can escape. Only safe metadata is logged.
 *
 * @param {object} notificationDoc Persisted Notification document (or null).
 * @param {object} [ioOverride] Test seam: replaces getIO() when provided.
 * @returns {Promise<boolean>} true when emitted, false when skipped/failed.
 */
const publishNotificationUnread = async (notificationDoc, ioOverride) => {
  try {
    if (!notificationDoc || !notificationDoc.recipient) return false;
    const io = ioOverride === undefined ? getIO() : ioOverride;
    if (!io) return false;

    const recipientId = String(notificationDoc.recipient);
    const unreadCount = await countUnreadNotifications(notificationDoc.recipient);
    io.to(userRoom(recipientId)).emit(NOTIFICATION_UNREAD, { unreadCount });
    return true;
  } catch (err) {
    try {
      console.error('Realtime notification-unread publish failed:', {
        recipient: notificationDoc && String(notificationDoc.recipient),
        type: notificationDoc && notificationDoc.type,
        reason: err && err.message,
      });
    } catch (_) {
      // Logging must never break notification creation either.
    }
    return false;
  }
};

module.exports = { publishNotificationUnread };
