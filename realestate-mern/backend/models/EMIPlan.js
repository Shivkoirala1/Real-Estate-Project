const mongoose = require('mongoose');

/**
 * EMIPlan model (Spec v2 - Feature 3)
 *
 * Tracking-only installment schedule for sales where paymentType = 'emi'.
 * Entirely manual: the agent sets up the schedule and ticks installments off
 * as the buyer pays them. The system's role is bookkeeping and visibility,
 * NOT processing - there is no payment gateway or automatic money movement.
 *
 * Installment.status is stored as pending | paid | waived; 'overdue' is
 * computed from dueDate vs today and never stored (see virtuals/helpers).
 */

// Stored statuses only - 'overdue' is always computed
const INSTALLMENT_STATUSES = ['pending', 'paid', 'waived'];
const PLAN_STATUSES = ['active', 'completed', 'defaulted', 'cancelled'];

const emiPlanSchema = new mongoose.Schema(
  {
    // Must reference a Sale with status = verified and paymentType = emi
    // (validated in the controller before creation)
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true, unique: true, index: true },
    // Denormalized for dashboard display
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    // Required - the registered buyer account the plan is linked to
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Manages this plan; only the assigned agent + admin can edit it
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Remaining amount to be paid via EMI (agreedPrice - downPaymentAmount)
    principalAmount: { type: Number, required: true, min: 0 },
    tenureMonths: { type: Number, required: true, min: 1 },
    // Manually entered by the agent (Nepali arrangements are often negotiated
    // flat amounts; an equal-split calculator can pre-fill the field client-side)
    installmentAmount: { type: Number, required: true, min: 0 },
    startDate: { type: Date, required: true },

    // === EMBEDDED SCHEDULE ===
    installments: [
      {
        installmentNumber: { type: Number, required: true, min: 1 },
        dueDate: { type: Date, required: true },
        amount: { type: Number, required: true, min: 0 },
        status: { type: String, enum: INSTALLMENT_STATUSES, default: 'pending' },
        paidDate: { type: Date, default: null },
        // Allows partial / early / over payments to be recorded as they actually happened
        paidAmount: { type: Number, default: null, min: 0 },
        // Lightweight note for manual overrides ("buyer deferred one month", etc.)
        remarks: { type: String, default: '', trim: true },
      },
    ],

    // Plan-level status, updated by the agent as the schedule progresses
    status: { type: String, enum: PLAN_STATUSES, default: 'active', index: true },

    // === LIGHTWEIGHT ACTIVITY TRAIL (plan-level events) ===
    activities: [
      {
        type: {
          type: String,
          enum: [
            'initialized',
            'installment_paid',
            'installment_paid_reverted',
            'installment_updated',
            'rescheduled',
            'status_changed',
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
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

emiPlanSchema.index({ agent: 1, status: 1 });
emiPlanSchema.index({ buyer: 1, status: 1 });
emiPlanSchema.index({ status: 1, 'installments.dueDate': 1 });

// ---------- Statics ----------
emiPlanSchema.statics.STATUSES = PLAN_STATUSES;
emiPlanSchema.statics.INSTALLMENT_STATUSES = INSTALLMENT_STATUSES;

// ---------- Helpers ----------

// Computed display status for one installment: stored status, with overdue
// derived (never stored) from dueDate vs today for pending installments.
emiPlanSchema.methods.installmentDisplayStatus = function (installment) {
  if (!installment) return 'pending';
  if (installment.status === 'paid' || installment.status === 'waived') return installment.status;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (installment.dueDate && new Date(installment.dueDate) < today) return 'overdue';
  return 'pending';
};

emiPlanSchema.methods.recordActivity = function ({ type = 'note_added', message, by = null, byName = 'System' }) {
  this.activities.push({ type, message, by, byName });
  return this;
};

// ---------- Virtuals (computed, not stored) ----------
emiPlanSchema.virtual('totalPaid').get(function () {
  return (this.installments || [])
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + (i.paidAmount != null ? i.paidAmount : i.amount || 0), 0);
});

emiPlanSchema.virtual('outstandingBalance').get(function () {
  const principal = this.principalAmount || 0;
  return Math.max(principal - this.totalPaid, 0);
});

// The first non-paid / non-waived installment by number
emiPlanSchema.virtual('nextDueInstallment').get(function () {
  const pending = (this.installments || [])
    .filter((i) => i.status === 'pending')
    .sort((a, b) => a.installmentNumber - b.installmentNumber);
  return pending.length > 0 ? pending[0] : null;
});

emiPlanSchema.virtual('overdueCount').get(function () {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (this.installments || []).filter(
    (i) => i.status === 'pending' && i.dueDate && new Date(i.dueDate) < today
  ).length;
});

module.exports = mongoose.model('EMIPlan', emiPlanSchema);
