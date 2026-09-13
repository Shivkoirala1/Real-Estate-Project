const mongoose = require('mongoose');

/**
 * Sale model (Spec v2 - Feature 1)
 *
 * A lightweight record an agent files once a deal is verbally/physically
 * agreed with a buyer. The admin's review of this single record is the only
 * "approval gate" in the sale flow:
 *
 *   pending_review  ->  verified   (property sold, lead closed, commission generated)
 *                   ->  rejected   (property/lead revert, agent can resubmit)
 *
 * No document checklists, no payment milestones - every amount here is
 * manually entered and tracked, never processed by the system.
 */

const SALE_STATUSES = ['pending_review', 'verified', 'rejected'];
const PAYMENT_TYPES = ['full_payment', 'emi', 'bank_loan'];

const saleSchema = new mongoose.Schema(
  {
    // === CORE REFERENCES ===
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: [true, 'A lead is required to file a sale'],
      index: true,
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'A property is required to file a sale'],
      index: true,
    },
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'The filing agent is required'],
      index: true,
    },

    // === BUYER DETAILS (manually entered by the agent) ===
    buyer: {
      name: { type: String, required: [true, 'Buyer name is required'], trim: true },
      phone: { type: String, default: '', trim: true },
      email: { type: String, default: '', trim: true, lowercase: true },
      // Optional link to a registered platform account. Required when
      // paymentType = 'emi' so the EMI dashboard has a buyer account to
      // attach the plan to (enforced in the controller).
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },

    // === DEAL TERMS ===
    agreedPrice: {
      type: Number,
      required: [true, 'Agreed sale price is required'],
      min: [0, 'Agreed price cannot be negative'],
    },
    paymentType: {
      type: String,
      enum: PAYMENT_TYPES,
      default: 'full_payment',
    },
    // Reference only (emi / bank_loan) - recorded for visibility, not processed
    downPaymentAmount: { type: Number, default: null, min: 0 },

    // === REVIEW STATE (the single approval gate) ===
    status: {
      type: String,
      enum: SALE_STATUSES,
      default: 'pending_review',
      index: true,
    },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    submittedAt: { type: Date, default: Date.now },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    // Required when status = rejected (enforced in controller), shown back to the agent
    rejectionReason: { type: String, default: '', trim: true },

    // Free-text notes - e.g. "buyer paying via family loan"
    remarks: { type: String, default: '', trim: true },

    // === ACTIVITY TIMELINE (embedded lightweight audit trail) ===
    activities: [
      {
        type: {
          type: String,
          enum: ['submitted', 'resubmitted', 'verified', 'rejected', 'note_added', 'updated'],
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
saleSchema.index({ status: 1, submittedAt: -1 });
saleSchema.index({ agent: 1, status: 1 });
saleSchema.index({ property: 1, status: 1 });
// Archival job scans exactly this shape (settled sales past their age cutoff)
saleSchema.index({ status: 1, updatedAt: 1 });
// A verified sale is one-to-one with its lead - block double-filing
saleSchema.index({ lead: 1, status: 1 }, { unique: true, sparse: true });

// ---------- Statics ----------
saleSchema.statics.STATUSES = SALE_STATUSES;
saleSchema.statics.PAYMENT_TYPES = PAYMENT_TYPES;

// ---------- Methods ----------
saleSchema.methods.recordActivity = function ({ type = 'updated', message, by = null, byName = 'System' }) {
  this.activities.push({ type, message, by, byName });
  return this;
};

module.exports = mongoose.model('Sale', saleSchema);
