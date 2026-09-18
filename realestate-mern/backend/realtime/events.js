/**
 * Realtime event contract (v1).
 *
 * Server -> client only. Client-to-server mutations stay REST-only; the
 * server emits these events after the authoritative database operation
 * succeeds. REST endpoints remain the source of truth and the recovery
 * path after reconnect (see the final implementation plan, Phase 9).
 *
 * Naming: `v1.<domain>.<fact>` — version prefix allows a future v2
 * without breaking v1 listeners.
 */

/**
 * Emitted to `user:<recipientId>` after notify() persists a notification.
 * Payload: { unreadCount: number } — authoritative current count, not a delta.
 */
const NOTIFICATION_UNREAD = 'v1.notification.unread';

/**
 * Emitted to `user:<recipientId>` when a persisted notification references
 * a conversation, and after message send/read-state changes that affect the
 * badge. Payload: { unreadCount: number } — authoritative current count.
 */
const CONVERSATION_UNREAD = 'v1.conversation.unread';

/**
 * Emitted to `conversation:<conversationId>` room members after addMessage
 * persists. Per-recipient masking applies (see maskSingleMessage):
 * admins receive the full `sender`, non-admins receive the REST-equivalent
 * masked payload for owner-side messages.
 * Payload: { conversationId: string, message: {...}, isActive: true }.
 */
const CONVERSATION_MESSAGE = 'v1.conversation.message';

/**
 * Emitted to `conversation:<conversationId>` room members after a
 * close/reopen REST operation succeeds.
 * Payload: { conversationId: string, isActive: boolean }.
 */
const CONVERSATION_STATUS = 'v1.conversation.status';

const V1 = {
  NOTIFICATION_UNREAD,
  CONVERSATION_UNREAD,
  CONVERSATION_MESSAGE,
  CONVERSATION_STATUS,
};

module.exports = {
  V1,
  NOTIFICATION_UNREAD,
  CONVERSATION_UNREAD,
  CONVERSATION_MESSAGE,
  CONVERSATION_STATUS,
};
