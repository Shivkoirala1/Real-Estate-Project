// Single source of truth mapping Notification.type -> category.
//
// Categories are DERIVED from the type at query time; no `category` field is
// stored on Notification documents. `system` exists for taxonomy/backward
// compatibility (legacy inquiry_* rows) but is never rendered as a UI tab.
const CATEGORY_TYPES = {
  messages: [
    'contact_form_received',
    'contact_form_responded',
    'conversation_message',
    'conversation_followup',
    'review_posted',
    'review_reply',
  ],
  visits: [
    'visit_requested',
    'visit_confirmed',
    'visit_rescheduled',
    'visit_rejected',
    'visit_cancelled',
    'visit_completed',
  ],
  deals: [
    'lead_assigned',
    'lead_created',
    'lead_stage_changed',
    'lead_closed',
    'lead_followup_due',
    'property_sold',
    'sale_submitted',
    'sale_verified',
    'sale_rejected',
    'rental_submitted',
    'rental_verified',
    'rental_rejected',
    'commission_paid',
    'commission_phase1_paid',
  ],
  management: [
    'management_request_submitted',
    'management_request_accepted',
    'management_request_declined',
    'management_terminated',
    'management_termination_requested',
    'tenancy_end_requested',
    'tenancy_end_approved',
    'tenancy_end_declined',
  ],
  payments: [
    'emi_installment_due',
    'emi_installment_overdue',
    'emi_plan_created',
    'emi_plan_pending',
    'emi_installment_updated',
    'emi_plan_status_changed',
    'emi_verification_requested',
    'emi_verification_approved',
    'emi_verification_rejected',
  ],
  system: [
    'system',
    'inquiry_received',
    'inquiry_read',
    'inquiry_responded',
    'inquiry_followup',
  ],
};

// UI tabs (subset of the taxonomy keys, in display order).
const UI_CATEGORIES = ['messages', 'visits', 'deals', 'management', 'payments'];

// Reverse lookup: type -> category (built once; every type belongs to
// exactly one category — enforced by scripts/check-notification-types.js).
const TYPE_CATEGORY = {};
for (const [category, types] of Object.entries(CATEGORY_TYPES)) {
  for (const type of types) TYPE_CATEGORY[type] = category;
}

// Returns the type list for a category. Throws on unknown categories so
// callers surface HTTP 400 instead of silently returning everything.
const typesForCategory = (category) => {
  const types = CATEGORY_TYPES[category];
  if (!types) {
    const err = new Error(`Unknown notification category: ${category}`);
    err.statusCode = 400;
    throw err;
  }
  return types;
};

const categoryForType = (type) => TYPE_CATEGORY[type] || null;

module.exports = { CATEGORY_TYPES, UI_CATEGORIES, typesForCategory, categoryForType };
