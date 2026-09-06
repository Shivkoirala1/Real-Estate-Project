const mongoose = require('mongoose');

// Lightweight audit trail for admin-side account changes. One document per
// field change or sensitive action, so there is always a record of who
// changed what on a user account and when.
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, enum: ['update', 'status_toggle', 'reset_password', 'delete', 'role_change_attempt'] },
    field: { type: String, default: '' },
    previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    meta: { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

auditLogSchema.index({ targetUser: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
