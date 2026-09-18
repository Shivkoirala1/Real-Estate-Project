const mongoose = require('mongoose');

// Lifecycle: pending -> active | declined; active -> termination_pending
//   -> terminated; active -> terminated (direct admin terminate).
// Terminal states (declined, terminated) never transition; a new request
// may be filed afterwards (partial index only guards live states).
const MANAGEMENT_STATUSES = [
  'pending',
  'active',
  'declined',
  'termination_pending',
  'terminated',
];

// Service names are denormalized strings captured at submission time so a
// later deactivation/rename of a ManagementService never alters what a
// historical request displays. Canonical list lives in ManagementService;
// this array is the submission-time snapshot, validated on create.
const propertyManagementRequestSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    // Denormalized from Property.listedBy for flat reporting queries
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    status: { type: String, enum: MANAGEMENT_STATUSES, default: 'pending', index: true },

    services: [{ type: String, trim: true }],

    // Owner's optional note at submission time
    note: { type: String, default: '', trim: true },

    // Admin's decline reason (required on decline)
    decisionReason: { type: String, default: '', trim: true },
    // Owner's optional reason for requesting termination
    terminationReason: { type: String, default: '', trim: true },
    // Admin's reason for terminating (required on direct terminate)
    terminatedReason: { type: String, default: '', trim: true },

    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    terminationRequestedAt: { type: Date, default: null },
    terminatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    terminatedAt: { type: Date, default: null },

    // Embedded audit trail - same shape used across the platform's other stateful modules
    activities: [
      {
        type: {
          type: String,
          enum: [
            'submitted',
            'accepted',
            'declined',
            'termination_requested',
            'terminated',
            'note_added',
          ],
          default: 'note_added',
        },
        message: { type: String, required: true, trim: true },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        byName: { type: String, default: 'System' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// One live (non-terminal) request per property at a time. Declined and
// terminated requests are terminal and do not block a fresh filing.
propertyManagementRequestSchema.index(
  { property: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'active', 'termination_pending'] } } }
);
propertyManagementRequestSchema.index({ owner: 1, createdAt: -1 });

propertyManagementRequestSchema.statics.STATUSES = MANAGEMENT_STATUSES;

propertyManagementRequestSchema.methods.recordActivity = function ({ type = 'note_added', message, by = null, byName = 'System' }) {
  this.activities.push({ type, message, by, byName });
  return this;
};

module.exports = mongoose.model('PropertyManagementRequest', propertyManagementRequestSchema);
