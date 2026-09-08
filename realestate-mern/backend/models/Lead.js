const mongoose = require('mongoose');

/**
 * Unified Lead model
 *
 * Every lead - no matter where it came from (contact form, property/office
 * visit, or manual creation by the team) - lives in this single collection
 * and flows through the same pipeline:
 *
 *   new -> contacted -> site_visit_scheduled -> negotiation -> pending_sale_verification -> closed / lost
 *
 * An agent moves a lead into `pending_sale_verification` by submitting a Sale
 * record. Agents can no longer set a lead directly to `closed` - only the
 * system does that automatically once an admin verifies the Sale (admins
 * retain manual close/reopen for edge cases).
 *
 * `source` records where the lead originated, `activities` is the embedded
 * audit trail shown in the admin timeline, and the various references
 * (contactForm / visit / property / user / conversationThreads) tie the lead
 * back to everything that happened around it.
 */

// Canonical pipeline stages (lowercase - legacy rows with capitalized stages
// such as 'New' / 'Site Visit Scheduled' are normalized by the migration
// script and by the controller before they ever reach a query).
const LEAD_STAGES = [
  'new',
  'contacted',
  'site_visit_scheduled',
  'negotiation',
  'pending_sale_verification',
  'closed',
  'lost',
];

// Where the lead came from
const LEAD_SOURCES = ['contact_form', 'property_visit', 'office_visit', 'manual_create'];

const leadSchema = new mongoose.Schema(
  {
    // === BASIC INFO ===
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },

    // === SOURCE & TRACKING ===
    source: {
      type: String,
      enum: LEAD_SOURCES,
      default: 'manual_create',
      index: true,
    },
    contactForm: { type: mongoose.Schema.Types.ObjectId, ref: 'ContactForm', default: null },
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null },

    // === PIPELINE & ASSIGNMENT ===
    stage: {
      type: String,
      enum: LEAD_STAGES,
      default: 'new',
      index: true,
    },
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    category: {
      type: String,
      enum: ['property', 'account', 'billing', 'technical'],
      default: 'property',
    },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },

    // === RELATED RECORDS ===
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    conversationThreads: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }],

    // === FOLLOW-UP & TRACKING ===
    notes: { type: String, default: '' },
    nextFollowUp: { type: Date, default: null, index: true },
    lastActivity: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },

    // === ACTIVITY TIMELINE (embedded audit trail) ===
    activities: [
      {
        type: {
          type: String,
          enum: [
            'created',
            'stage_changed',
            'assigned',
            'note_added',
            'follow_up_set',
            'follow_up_done',
            'converted',
            'conversation_message',
            'sale_submitted',
            'sale_verified',
            'sale_rejected',
            'updated',
          ],
          default: 'updated',
        },
        message: { type: String, required: true, trim: true },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        byName: { type: String, default: 'System' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ---------- Indexes for the hot queries ----------
leadSchema.index({ stage: 1, assignedAgent: 1 });
leadSchema.index({ assignedAgent: 1, updatedAt: -1 });
leadSchema.index({ source: 1, createdAt: -1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ name: 'text', email: 'text' });

// ---------- Virtuals ----------
leadSchema.virtual('isActive').get(function () {
  return !['closed', 'lost', 'pending_sale_verification'].includes(this.stage);
});

// Overdue follow-up helper usable in aggregations via $gt comparisons elsewhere
leadSchema.virtual('isOverdue').get(function () {
  return Boolean(this.nextFollowUp && this.nextFollowUp < new Date() && !['closed', 'lost'].includes(this.stage));
});

// ---------- Statics & helpers ----------

// Maps legacy capitalized stage values (and aliases) onto canonical stages so
// old data and old clients keep working after the migration.
leadSchema.statics.normalizeStage = function (stage) {
  if (!stage) return null;
  const map = {
    new: 'new',
    contacted: 'contacted',
    site_visit_scheduled: 'site_visit_scheduled',
    negotiation: 'negotiation',
    pending_sale_verification: 'pending_sale_verification',
    closed: 'closed',
    lost: 'lost',
    // legacy capitalized values
    'new': 'new',
    'contacted': 'contacted',
    'site visit scheduled': 'site_visit_scheduled',
    'office visit scheduled': 'site_visit_scheduled',
    'negotiation': 'negotiation',
    'pending sale verification': 'pending_sale_verification',
    'sale pending verification': 'pending_sale_verification',
    'closed': 'closed',
    'lost': 'lost',
  };
  return map[String(stage).trim().toLowerCase()] || null;
};

leadSchema.statics.STAGES = LEAD_STAGES;
leadSchema.statics.SOURCES = LEAD_SOURCES;

/**
 * Push an activity entry onto the embedded timeline and bump lastActivity.
 * Usage: lead.recordActivity({ type: 'stage_changed', message: '...', by: user })
 */
leadSchema.methods.recordActivity = function ({ type = 'updated', message, by = null, byName = 'System' }) {
  this.activities.push({ type, message, by, byName });
  this.lastActivity = new Date();
  return this;
};

module.exports = mongoose.model('Lead', leadSchema);
