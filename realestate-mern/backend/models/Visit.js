const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema(
  {
    visitType: {
      type: String,
      enum: ['property', 'office'],
      default: 'property',
    },
    property: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Property',
      default: null,
      required: [
        function () {
          return this.visitType === 'property';
        },
        'Property reference is required for site visits',
      ],
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Buyer reference is required'],
    },
    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    requestedSlot: {
      type: Date,
      required: [true, 'Visit date and time slot are required'],
    },
    // Lead created from / linked to this visit. Set automatically when an
    // accepted visit is converted by the pipeline (ensureLeadFromVisit) or
    // manually by an admin (convert-to-lead).
    convertedLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
    status: {
      type: String,
      enum: [
        'pending_agent_review',
        'confirmed',
        'rejected',
        'completed',
        'cancelled',
      ],
      default: 'pending_agent_review',
    },
    buyerNotes: {
      type: String,
      default: '',
      trim: true,
    },
    internalNotes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Visit', visitSchema);