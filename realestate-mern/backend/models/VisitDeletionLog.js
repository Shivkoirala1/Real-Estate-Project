const mongoose = require('mongoose');

// Audit snapshot persisted BEFORE a visit document is deleted (Phase 1:
// cancelled-only, admin or assigned-agent deletes). Visits are not an
// archivable type, so this log is the permanent record of what was removed,
// by whom, and what it referenced. No cascade: linked leads, notifications,
// reviews and rewards are never touched by a visit delete (deletes with a
// pipeline footprint are rejected with 409 instead).
const visitDeletionLogSchema = new mongoose.Schema(
  {
    // Identity of the removed visit
    visit: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, required: true },
    visitType: { type: String, default: '' },
    // Scheduling
    requestedSlot: { type: Date, default: null },
    // Assignment + references
    assignedAgent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
    // Pipeline footprint at deletion time (always null under the
    // block-when-linked rule, recorded to prove the check ran)
    convertedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    linkedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
    // Deletion actor + timestamp
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deletedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

visitDeletionLogSchema.index({ deletedBy: 1, deletedAt: -1 });

module.exports = mongoose.model('VisitDeletionLog', visitDeletionLogSchema);
