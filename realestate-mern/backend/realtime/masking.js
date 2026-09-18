/**
 * Single-message masking shared by REST responses and the realtime
 * publisher. Non-admin viewers never see the raw `sender` of owner-side
 * messages; `senderName` is already a safe display value. Accepts plain
 * objects or Mongoose subdocuments.
 *
 * Extracted from controllers/conversationController.js (maskOwnerIdentity)
 * so socket payloads preserve REST's information-exposure rules without
 * duplicating the logic.
 */
const maskSingleMessage = (msg, viewerIsAdmin) => {
  if (viewerIsAdmin) return msg && typeof msg.toObject === 'function' ? msg.toObject() : msg;
  const plain = msg && typeof msg.toObject === 'function' ? msg.toObject() : msg;
  if (plain && plain.side === 'owner') {
    return {
      ...plain,
      sender: undefined, // Hide actual admin who replied
    };
  }
  return plain;
};

module.exports = { maskSingleMessage };
