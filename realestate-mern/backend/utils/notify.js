const Notification = require('../models/Notification');
const { publishNotificationUnread } = require('../realtime/notifyPublisher');

// Small helper so controllers don't repeat the same Notification.create boilerplate.
// Swallows errors so a notification failure never breaks the primary request
// (e.g. an inquiry should still save even if, for some reason, the notification doesn't).
//
// Accepted related-record fields: contactForm, lead,
// conversation, visit, property, sale, rental, commissionRecord, emiPlan,
// propertyManagementRequest - only the ones provided are stored, the rest
// stay null. `link` is the in-app path the notification opens when clicked.
const notify = async ({
  recipient,
  type,
  title,
  message,
  contactForm = null,
  lead = null,
  conversation = null,
  visit = null,
  property = null,
  sale = null,
  rental = null,
  commissionRecord = null,
  emiPlan = null,
  propertyManagementRequest = null,
  link = '',
}) => {
  if (!recipient) return null;
  try {
    const doc = await Notification.create({
      recipient,
      type,
      title,
      message,
      contactForm,
      lead,
      conversation,
      visit,
      property,
      sale,
      rental,
      commissionRecord,
      emiPlan,
      propertyManagementRequest,
      link,
    });
    // Realtime delivery (Phase 7): emit only after persistence succeeded.
    // Never throws — publishNotificationUnread swallows all realtime
    // failures, so fire-and-forget callers (no await) stay safe too.
    await publishNotificationUnread(doc);
    return doc;
  } catch (err) {
    console.error('Failed to create notification:', err.message);
    return null;
  }
};

// Convenience: notify several recipients at once (e.g. all admins) with the same content
const notifyMany = async (recipients = [], payload) => {
  const unique = [...new Set(recipients.map((r) => String(r)))];
  return Promise.all(unique.map((recipient) => notify({ ...payload, recipient })));
};

module.exports = { notify, notifyMany };
