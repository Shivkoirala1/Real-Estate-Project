const mongoose = require('mongoose');

// Lightweight server-issued upload session (direct-upload migration,
// decision §14.1). NOT a property-draft system: it carries no business
// fields, only ownership + scope + lifetime, so the existing property
// workflow is untouched. The client cannot invent or borrow sessions —
// every sign/complete/commit call re-asserts session ownership.
const uploadSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Which upload family this session may authorize (see
    // config/uploadPurposes.js SESSION_SCOPES).
    scope: {
      type: String,
      enum: ['property', 'hero', 'blog', 'avatar', 'verification', 'emi', 'innovation'],
      required: true,
    },
    status: {
      type: String,
      enum: ['open', 'closed', 'expired'],
      default: 'open',
      index: true,
    },
    // Optional correlation refs recorded for later phases (e.g. EMI
    // planId/installmentNo, hero slide draft label). Opaque to authZ.
    ref: { type: String, default: '' },
    expiresAt: { type: Date, required: true, index: true },
  },
  { timestamps: true }
);

// Deliberately NO TTL index: expiry must flip status (audit trail for
// abandoned-upload tracking), not delete the row. The upload sweeper owns
// the open → expired transition.
uploadSessionSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('UploadSession', uploadSessionSchema);
