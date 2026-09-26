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
 *
 * Two-phase payout (new source of truth): the frozen commissionAmount is
 * split once at verification time into phase1Amount + phase2Amount
 * (custom first-phase amount, default 50/50). payoutStatus is derived:
 *   pending = neither phase paid
 *   partial = phase 1 paid, phase 2 unpaid
 *   paid    = both phases paid
 * Legacy isPaid / paidAt / paidNote are synchronized derived compatibility
 * fields (isPaid === payoutStatus 'paid', paidAt === phase2PaidAt).
 */

const commissionRecordSchema = new mongoose.Schema(
  {
    // One-to-one with the verified sale or rental
    sale:   { type: mongoose.Schema.Types.ObjectId, ref: 'Sale',   default: null, index: true },
rental: { type: mongoose.Schema.Types.ObjectId, ref: 'Rental', default: null, index: true },
    // Denormalized for easy reporting
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Transaction value - Sale.agreedPrice, or the rental's lease value
    // (monthlyRent x durationInMonths)
    transactionAmount: { type: Number, required: true, min: 0 },
    // Effective % at the time of calculation (frozen)
    commissionPercentage: { type: Number, required: true, min: 0, max: 100 },
    // Sale: transactionAmount x commissionPercentage / 100.
    // Rental: entered by the admin at verification; the % above is
    // back-computed from this amount for reporting consistency.
    commissionAmount: { type: Number, required: true, min: 0 },

    // Two-phase payout - the new source of truth. phase1Amount + phase2Amount
    // must equal commissionAmount (±0.01). Phase 2 is never payable before
    // phase 1 (enforced in the controller, not just the UI).
    phase1Amount: { type: Number, required: true, min: 0, default: 0 },
    phase1Paid: { type: Boolean, default: false, index: true },
    phase1PaidAt: { type: Date, default: null },
    phase1Note: { type: String, default: '', trim: true },
    phase2Amount: { type: Number, required: true, min: 0, default: 0 },
    phase2Paid: { type: Boolean, default: false, index: true },
    phase2PaidAt: { type: Date, default: null },
    phase2Note: { type: String, default: '', trim: true },
    payoutStatus: {
      type: String,
      enum: ['pending', 'partial', 'paid'],
      default: 'pending',
      index: true,
    },

    // Legacy compatibility fields - DERIVED from the phase fields via the
    // pre-validate hook below. Kept this release so old filters/analytics
    // keep working; do not write them directly in new code.
    isPaid: { type: Boolean, default: false, index: true },
    paidAt: { type: Date, default: null },
    // Free-text reference, e.g. "cash handed over 2082-05-12"
    paidNote: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

// Backfill + invariant enforcement for every save path (create/update).
// Because phase1Amount/phase2Amount default to 0, an untouched new record
// for a non-zero total sums to 0 and is recognized here as "split not
// provided" -> derived deterministically (half/remainder). Any explicitly
// provided split that does not sum to the total is rejected, never silently
// repaired. payoutStatus / isPaid / paidAt are always re-derived so callers
// cannot persist a contradictory combination.
commissionRecordSchema.pre('validate', function phaseSync(next) {
  try {
    const phases = require('../utils/commissionPhases');
    const total = phases.round2(this.commissionAmount);
    if (total > 0) {
      const p1 = Number(this.phase1Amount) || 0;
      const p2 = Number(this.phase2Amount) || 0;
      const sum = phases.round2(p1 + p2);
      if (Math.abs(sum - total) > 0.01) {
        // Untouched defaults (0/0, nothing paid): the caller did not provide
        // a split - derive it. This covers new creates without phases AND
        // legacy documents loaded from the DB before migration.
        const untouchedDefaults = p1 === 0 && p2 === 0
          && !this.phase1Paid && !this.phase2Paid;
        if (untouchedDefaults) {
          const half = phases.round2(total / 2);
          this.phase1Amount = half;
          this.phase2Amount = phases.round2(total - half);
          // A legacy isPaid=true seed created without phases stays fully paid.
          if (this.isPaid) {
            this.phase1Paid = true;
            this.phase2Paid = true;
            this.phase1PaidAt = this.phase1PaidAt || this.paidAt || new Date();
            this.phase2PaidAt = this.phase2PaidAt || this.paidAt || new Date();
          }
        } else {
          return next(new Error(
            `Phase amounts (${sum}) must sum to the commission total (${total}).`
          ));
        }
      }
      // Ordering invariant: phase 2 can never be paid while phase 1 is unpaid
      // (except the zero-total auto-settled case handled in syncDerivedFields).
      if (this.phase2Paid && !this.phase1Paid) {
        return next(new Error('Phase 2 cannot be paid before Phase 1.'));
      }
    }
    phases.syncDerivedFields(this);
    return next();
  } catch (err) {
    return next(err);
  }
});

commissionRecordSchema.index({ agent: 1, isPaid: 1 });
commissionRecordSchema.index({ isPaid: 1, createdAt: -1 });
commissionRecordSchema.index({ agent: 1, payoutStatus: 1 });
commissionRecordSchema.index({ payoutStatus: 1, createdAt: -1 });

module.exports = mongoose.model('CommissionRecord', commissionRecordSchema);
