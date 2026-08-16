const mongoose = require('mongoose');

// One message in the back-and-forth thread. "side" tracks which party sent
// it so the UI can render bubbles on the right side of the conversation
// without having to re-derive it from sender/property.listedBy every time.
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
    status: { type: String, enum: ['new', 'read', 'responded'], default: 'new' },

    // Full two-way conversation thread. messages[0] is always the original
    // inquiry message; every reply from either the inquirer or the property
    // owner/admin is appended here so both sides can see the whole exchange.
    messages: [messageSchema],

    // Legacy single-reply fields, kept so older data still displays. New
    // code should read/write through `messages` instead.
    response: { type: String, default: '' },
    respondedAt: { type: Date, default: null },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Inquiry', inquirySchema);
