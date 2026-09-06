const mongoose = require('mongoose');

/**
 * ContactForm - submissions from the public contact page.
 *
 * A contact form is the "raw intake" record: admins review it in the inbox,
 * reply to it, and/or convert it into a pipeline Lead (status 'converted',
 * with `convertedLead` pointing at the created Lead).
 */
const contactFormSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  phone: { type: String, default: '' },
  subject: { type: String, required: true },
  message: { type: String, required: true },
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // if logged-in user submitted
  status: {
    type: String,
    enum: ['new', 'read', 'responded', 'converted'],
    default: 'new',
    index: true,
  },
  response: { type: String, default: '' },
  respondedAt: { type: Date, default: null },
  respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Set when this submission is converted into a pipeline lead
  convertedLead: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
}, { timestamps: true });

// Admin inbox sorts by newest
contactFormSchema.index({ createdAt: -1 });
contactFormSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ContactForm', contactFormSchema);
