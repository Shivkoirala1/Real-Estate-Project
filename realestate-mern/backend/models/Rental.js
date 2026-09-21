const mongoose = require('mongoose');

/**
 * Rental model — one-time filing of an agreed lease, mirroring Sale.
 *
 *   pending_review -> verified  (property -> 'rented', lead closed, commission recorded)
 *                  -> rejected  (property -> 'available', lead -> negotiation)
 */

const RENTAL_STATUSES = ['pending_review', 'verified', 'rejected'];

const rentalSchema = new mongoose.Schema(
  {
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      required: [true, 'A lead is required to file a rental'],
      // No plain index here on purpose - a {lead:1} index would collide with
      // the partial unique index below at index-sync time (same default
      // name). Lead-scoped pending checks are served by that partial index.
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      required: [true, 'A property is required to file a rental'],
      index: true,
    },
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'The filing agent is required'],
      index: true,
    },

    // === TENANT DETAILS (manually entered, mirrors Sale.buyer) ===
    tenant: {
      name: { type: String, required: [true, 'Tenant name is required'], trim: true },
      phone: { type: String, default: '', trim: true },
      email: { type: String, default: '', trim: true, lowercase: true },
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    },

    // === DEAL TERMS (lease-shaped) ===
    startDate: {
      type: Date,
      required: [true, 'Lease start date is required'],
    },
    monthlyRent: {
      type: Number,
      required: [true, 'Monthly rent is required'],
      min: [0, 'Monthly rent cannot be negative'],
    },
    // Optional - null means an open-ended (month-to-month) tenancy with no
    // fixed end date. Lease-value-derived figures fall back accordingly.
    durationInMonths: {
      type: Number,
      default: null,
      min: [1, 'Lease duration must be at least 1 month'],
    },
    // Optional - some landlords may not require a security deposit
    securityDeposit: { type: Number, default: 0, min: 0 },
    remarks: { type: String, default: '', trim: true },

    // === REVIEW STATE (identical shape to Sale) ===
    status: {
      type: String,
      enum: RENTAL_STATUSES,
      default: 'pending_review',
      index: true,
    },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    submittedAt: { type: Date, default: Date.now },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '', trim: true },

    // === ACTIVITY TIMELINE ===
    activities: [
      {
        type: {
          type: String,
          enum: ['submitted', 'resubmitted', 'verified', 'rejected', 'updated'],
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

// Commission basis, in one place. Null when the tenancy is open-ended
// (no duration) so "unknown" never masquerades as zero.
rentalSchema.virtual('totalLeaseValue').get(function () {
  if (this.durationInMonths === null || this.durationInMonths === undefined) return null;
  return this.monthlyRent * this.durationInMonths;
});

// ---------- Indexes ----------
rentalSchema.index({ status: 1, submittedAt: -1 });
rentalSchema.index({ agent: 1, status: 1 });
rentalSchema.index({ property: 1, status: 1 });
// At most one pending_review filing per lead at a time - rejected/verified
// history is kept permanently, so the unique constraint must cover only the
// pending state (same partial-index pattern as PropertyManagementRequest)
rentalSchema.index({ lead: 1 }, { unique: true, partialFilterExpression: { status: 'pending_review' } });

// ---------- Statics ----------
rentalSchema.statics.STATUSES = RENTAL_STATUSES;

// ---------- Methods ----------
rentalSchema.methods.recordActivity = function ({ type = 'updated', message, by = null, byName = 'System' }) {
  this.activities.push({ type, message, by, byName });
  return this;
};

module.exports = mongoose.model('Rental', rentalSchema);