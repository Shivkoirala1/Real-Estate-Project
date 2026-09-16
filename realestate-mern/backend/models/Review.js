const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, maxlength: 1000 },

    // Eligibility trail - records *why* this review was allowed, so it's
    // auditable later even if the underlying visit/sale/rental is edited or
    // removed.
    eligibility: {
      type: String,
      enum: ['visit', 'purchase', 'rental'],
      required: true,
    },

    // Admin moderation - hidden reviews stay in the DB (for records/appeals)
    // but are excluded from the public property page and the average rating.
    isVisible: { type: Boolean, default: true },

    // A single admin reply per review (matches how most review systems work -
    // one official response, editable/overwritable by any admin).
    adminReply: {
      text: { type: String, trim: true, maxlength: 1000, default: '' },
      repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      repliedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// One review per user per property - both to keep things honest and because
// it doubles as the reward dedupe (a user can only ever earn REVIEW_WRITE
// coins once per property).
reviewSchema.index({ property: 1, user: 1 }, { unique: true });
reviewSchema.index({ property: 1, isVisible: 1 });

module.exports = mongoose.model('Review', reviewSchema);
