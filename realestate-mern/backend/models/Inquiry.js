const mongoose = require('mongoose');

// One message in the back-and-forth thread.
const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    senderName: { type: String, default: '' },
    side: { type: String, enum: ['inquirer', 'owner'], required: true },
    body: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const inquirySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true },
    phone: { type: String, default: '' },
    subject: { type: String, default: 'General Inquiry' },
    message: { type: String, required: true },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit', default: null },
    // Legacy status for simple message tracking
    status: { type: String, enum: ['new', 'read', 'responded'], default: 'new' },

    // Core Lead & Pipeline Extensions
    category: { 
      type: String, 
      enum: ['property', 'account', 'billing', 'technical'], 
      default: 'property' 
    },
    stage: { 
      type: String, 
      enum: ['New', 'Contacted', 'Site Visit Scheduled', 'Negotiation', 'Closed', 'Lost'], 
      default: 'New' 
    },
    assignedAgent: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      default: null 
    },
    visitId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Visit', 
      default: null 
    },

    // Full two-way conversation thread
    messages: [messageSchema],

    // Legacy single-reply fields
    response: { type: String, default: '' },
    respondedAt: { type: Date, default: null },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Inquiry', inquirySchema);