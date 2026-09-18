const Conversation = require('../models/Conversation');
const Notification = require('../models/Notification');

/**
 * Shared unread-count queries for REST endpoints and the realtime
 * publisher. Single source of truth so socket-emitted counts can never
 * drift from what `GET .../unread-count` returns.
 *
 * Moved verbatim from controllers/conversationController.js (Phase 1);
 * that controller now imports these instead of defining them locally.
 */

/**
 * Resolve which side ('inquirer' | 'owner' | null) the given user sits on
 * for a conversation. Works with populated docs or raw ObjectIds.
 */
const sideForUser = (conversation, userId) => {
  const id = String(userId);
  if (conversation.inquirer && String(conversation.inquirer._id || conversation.inquirer) === id) {
    return 'inquirer';
  }
  if (conversation.owner && String(conversation.owner._id || conversation.owner) === id) {
    return 'owner';
  }
  return null;
};

/**
 * A thread is unread for a viewer when the newest message was sent by the
 * OTHER side and arrived after the viewer's lastReadAt stamp (missing stamp
 * counts as never read).
 */
const isUnreadForViewer = (conversation, viewerId) => {
  const side = sideForUser(conversation, viewerId);
  if (!side) return false;
  const messages = conversation.messages || [];
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.side === side) return false;

  const lastReadAt = conversation.lastReadAt?.[side];
  if (!lastReadAt) return true;
  return new Date(conversation.lastMessageAt).getTime() > new Date(lastReadAt).getTime();
};

/**
 * Current unread-thread count for a user (participant-scoped, active
 * threads only). Same query/projection as GET /api/conversations/unread-count.
 */
const countUnreadConversations = async (userId) => {
  // We only need the fields the unread rule uses, so the select keeps the
  // payload tiny.
  const conversations = await Conversation.find({
    $or: [{ inquirer: userId }, { owner: userId }],
    isActive: true,
  }).select('inquirer owner messages.side lastMessageAt lastReadAt');

  return conversations.reduce(
    (total, conv) => total + (isUnreadForViewer(conv, userId) ? 1 : 0),
    0
  );
};

/**
 * Current unread-notification count for a user.
 * Same query as GET /api/notifications/unread-count.
 */
const countUnreadNotifications = async (recipientId) => {
  return Notification.countDocuments({ recipient: recipientId, isRead: false });
};

module.exports = {
  sideForUser,
  isUnreadForViewer,
  countUnreadConversations,
  countUnreadNotifications,
};
