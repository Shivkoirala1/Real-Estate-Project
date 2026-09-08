const mongoose = require('mongoose');

/**
 * CommissionRecord model (Spec v2 - Feature 2)
 *
 * Simplified flat-percentage commission - no ledger, no tax fields, no splits.
 * Created automatically (inside the same transaction) when an admin verifies
 * a Sale. The effective commission % is computed once at verification time
 * and frozen here, so later rate changes never retroactively alter a
 * historical commission.
 *
 * Effective % rule:
 *   Property.commissionPercentage (if set) otherwise
 *   PropertyType.defaultCommissionPercentage
 */

const commissionRecordSchema = new mongoose.Schema(
  {
    // One-to-one with the verified sale
    sale: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Sale',
      required: true,
      unique: true,
      index: true,
    },
    // Denormalized for easy reporting
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Copied from Sale.agreedPrice at verification time
    saleAmount: { type: Number, required: true, min: 0 },
    // Effective % at the time of calculation (frozen)
    commissionPercentage: { type: Number, required: true, min: 0, max: 100 },
    // saleAmount x commissionPercentage / 100
    commissionAmount: { type: Number, required: true, min: 0 },

    // Simple tracking flag - Sale verification is already the approval gate,
    // so there is no separate approval sub-workflow here.
    isPaid: { type: Boolean, default: false, index: true },
    paidAt: { type: Date, default: null },
    // Free-text reference, e.g. "cash handed over 2082-05-12"
    paidNote: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

commissionRecordSchema.index({ agent: 1, isPaid: 1 });
commissionRecordSchema.index({ isPaid: 1, createdAt: -1 });

module.exports = mongoose.model('CommissionRecord', commissionRecordSchema);
