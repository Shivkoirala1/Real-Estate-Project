// LEGACY - no longer routed.
//
// The inquiry system was replaced by the unified lead management module.
// Incoming contact submissions are handled by `contactFormController`
// (POST /api/contact-forms), which admins can then convert into pipeline
// leads (`POST /api/contact-forms/:id/convert-to-lead`). Two-way messaging
// lives in `conversationController` (/api/conversations).
//
// This stub is intentionally empty so that any accidental import fails loud
// and clear instead of silently using the retired logic.
module.exports = {};
