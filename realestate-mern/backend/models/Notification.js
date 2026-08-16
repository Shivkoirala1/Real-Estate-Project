const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    type: {
      type: String,
      enum: [
        'inquiry_received',   // someone sent an inquiry on your property (or a general contact message, for admins)
        'inquiry_read',       // the person you inquired to has viewed your inquiry
        'inquiry_responded',  // the person you inquired to replied to your inquiry
        'inquiry_followup',   // a new message was added to an existing inquiry thread
        'property_sold',      // a property's status was changed to sold - admin alert
        'system',             // generic/system notification, reserved for future use
      ],
      required: true,
    },

    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },

    inquiry: { type: mongoose.Schema.Types.ObjectId, ref: 'Inquiry', default: null },
    property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },

    // Where the bell/notification card should take the user when clicked
    link: { type: String, default: '' },

    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
