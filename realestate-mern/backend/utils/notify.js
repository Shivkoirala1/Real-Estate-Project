const Notification = require('../models/Notification');

// Small helper so controllers don't repeat the same Notification.create boilerplate.
// Swallows errors so a notification failure never breaks the primary request
// (e.g. an inquiry should still save even if, for some reason, the notification doesn't).
//
// Accepted related-record fields: inquiry (legacy), contactForm, lead,
// conversation, visit, property - only the ones provided are stored, the rest
// stay null. `link` is the in-app path the notification opens when clicked.
const notify = async ({
  recipient,
  type,
  title,
  message,
  inquiry = null,
  contactForm = null,
  lead = null,
  conversation = null,
  visit = null,
  property = null,
  sale = null,
  commissionRecord = null,
  emiPlan = null,
  link = '',
}) => {
  if (!recipient) return null;
  try {
    return await Notification.create({
      recipient,
      type,
      title,
      message,
      inquiry,
      contactForm,
      lead,
      conversation,
      visit,
      property,
      sale,
      commissionRecord,
      emiPlan,
      link,
    });
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
