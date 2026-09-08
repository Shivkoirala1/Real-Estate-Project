const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  // Reference to inquiry or lead
  inquiry: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ContactForm', 
    default: null 
  },
  lead: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Lead', 
    default: null 
  },
  
  // Participants
  inquirer: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  },
  owner: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Conversation messages
  messages: [{
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    senderName: { type: String, required: true },
    side: { type: String, enum: ['inquirer', 'owner'], required: true },
    body: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: Date.now },
  }],
  
  // Metadata
  property: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
  lastMessageAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },

  // Timestamp each side last opened this thread. A thread is "unread" for a
  // given side when the newest message came from the OTHER side and is newer
  // than that side's lastReadAt.
  lastReadAt: {
    inquirer: { type: Date, default: null },
    owner: { type: Date, default: null },
  },
}, { timestamps: true });

module.exports = mongoose.model('Conversation', conversationSchema);