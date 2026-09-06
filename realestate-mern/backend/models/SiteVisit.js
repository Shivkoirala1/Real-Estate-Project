const mongoose = require('mongoose');

const siteVisitSchema = new mongoose.Schema(
  {
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
    visitor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    preferredDate: { type: Date, required: true },
    note: { type: String, default: '', trim: true, maxlength: 500 },

    // pending -> owner/admin hasn't responded yet
    // confirmed -> owner/admin has scheduled it
    // completed -> the visit actually happened (this is what pays out the
    //              larger "site visit completed" reward)
    // cancelled -> either side called it off
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'completed', 'cancelled'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

siteVisitSchema.index({ property: 1, status: 1 });
siteVisitSchema.index({ visitor: 1, createdAt: -1 });

module.exports = mongoose.model('SiteVisit', siteVisitSchema);
