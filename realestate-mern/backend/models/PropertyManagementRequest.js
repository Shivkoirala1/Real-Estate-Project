const mongoose = require('mongoose');

const MANAGEMENT_STATUSES = ['pending_review', 'approved', 'rejected', 'active', 'terminated'];

const MANAGEMENT_SERVICES = [
  'tenant_management',
  'rent_collection',
  'property_inspection',
  'maintenance_coordination',
  'lease_management',
  'property_marketing',
  'utility_management',
  'general_supervision',
];

const propertyManagementRequestSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    // Denormalized from Property.listedBy at creation time, for flat reporting queries
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Independent of `status` - can be set/changed by an admin at any time,
    // including before or after approval, without needing its own status value.
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    status: { type: String, enum: MANAGEMENT_STATUSES, default: 'pending_review', index: true },
    rejectionReason: { type: String, default: '', trim: true }, // required when status = rejected

    services: [{ type: String, enum: MANAGEMENT_SERVICES }],
    preferredStartDate: { type: Date, default: null },
    ownerNotes: { type: String, default: '', trim: true },

    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    terminatedAt: { type: Date, default: null },
    terminationReason: { type: String, default: '', trim: true },

    // Embedded audit trail - same shape used across the platform's other stateful modules
    activities: [
      {
        type: {
          type: String,
          enum: [
            'submitted', 'approved', 'rejected', 'agent_assigned', 'agent_reassigned',
            'status_changed', 'note_added', 'terminated',
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

// One live (non-terminal) request per property at a time
propertyManagementRequestSchema.index(
  { property: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending_review', 'approved', 'active'] } } }
);
propertyManagementRequestSchema.index({ assignedAgent: 1, status: 1 });
propertyManagementRequestSchema.index({ owner: 1, createdAt: -1 });

propertyManagementRequestSchema.statics.STATUSES = MANAGEMENT_STATUSES;
propertyManagementRequestSchema.statics.SERVICES = MANAGEMENT_SERVICES;

propertyManagementRequestSchema.methods.recordActivity = function ({ type = 'note_added', message, by = null, byName = 'System' }) {
  this.activities.push({ type, message, by, byName });
  return this;
};

module.exports = mongoose.model('PropertyManagementRequest', propertyManagementRequestSchema);
