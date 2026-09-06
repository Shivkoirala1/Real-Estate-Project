const Conversation = require('../models/Conversation');
const Property = require('../models/Property');
const User = require('../models/User');
const Lead = require('../models/Lead');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyMany } = require('../utils/notify');

/**
 * Mask owner identity for non-admin users
 * Hides the actual admin user who replied on behalf of the property owner
 */
const maskOwnerIdentity = (conversation, viewerIsAdmin) => {
  if (viewerIsAdmin) return conversation;

  const plain = conversation.toObject ? conversation.toObject() : conversation;
  plain.messages = (plain.messages || []).map((msg) =>
    msg.side === 'owner'
      ? {
          ...msg,
          sender: undefined, // Hide actual admin who replied
        }
      : msg
  );
  return plain;
};

/**
 * Resolve which side ('inquirer' | 'owner' | null) the given user sits on
 * for a conversation. Works with populated docs or raw ObjectIds.
 */
const sideForUser = (conversation, userId) => {
  const id = String(userId);
  if (conversation.inquirer && String(conversation.inquirer._id || conversation.inquirer) === id) {
    return 'inquirer';
  }
  if (conversation.owner && String(conversation.owner._id || conversation.owner) === id) {
    return 'owner';
  }
  return null;
};

/**
 * A thread is unread for a viewer when the newest message was sent by the
 * OTHER side and arrived after the viewer's lastReadAt stamp (missing stamp
 * counts as never read).
 */
const isUnreadForViewer = (conversation, viewerId) => {
  const side = sideForUser(conversation, viewerId);
  if (!side) return false;
  const messages = conversation.messages || [];
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.side === side) return false;

  const lastReadAt = conversation.lastReadAt?.[side];
  if (!lastReadAt) return true;
  return new Date(conversation.lastMessageAt).getTime() > new Date(lastReadAt).getTime();
};

/**
 * @desc    Create a new conversation thread
 * @route   POST /api/conversations
 * @access  Private
 */
const createConversation = asyncHandler(async (req, res) => {
  const { inquirer, owner, property, lead, initialMessage } = req.body;

  if (!owner || !initialMessage) {
    return res.status(400).json({
      success: false,
      message: 'Owner and initial message are required',
    });
  }

  if (!initialMessage.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Initial message cannot be empty',
    });
  }

  if (inquirer && inquirer === owner) {
    return res.status(400).json({
      success: false,
      message: 'Inquirer and owner cannot be the same user',
    });
  }

  // Verify users exist
  const [inquirerUser, ownerUser] = await Promise.all([
    inquirer ? User.findById(inquirer) : Promise.resolve(null),
    User.findById(owner),
  ]);

  if (inquirer && !inquirerUser) {
    return res.status(404).json({
      success: false,
      message: 'Inquirer not found',
    });
  }
  if (!ownerUser) {
    return res.status(404).json({
      success: false,
      message: 'Owner not found',
    });
  }

  // Verify property exists if provided
  let propertyDoc = null;
  if (property) {
    propertyDoc = await Property.findById(property).select('title listedBy');
    if (!propertyDoc) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }
  }

  // Verify lead exists if provided, so the thread links into the pipeline
  let leadDoc = null;
  if (lead) {
    leadDoc = await Lead.findById(lead);
    if (!leadDoc) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found',
      });
    }
  }

  // Create conversation
  const conversation = await Conversation.create({
    inquirer: inquirer || null,
    owner,
    property: property || null,
    lead: lead || null,
    messages: [
      {
        sender: req.user._id,
        senderName: req.user.name,
        side: String(req.user._id) === String(owner) ? 'owner' : 'inquirer',
        body: initialMessage.trim(),
      },
    ],
    lastMessageAt: new Date(),
    isActive: true,
  });

  // Register the thread on the lead so it shows up in the lead's timeline view
  if (leadDoc) {
    leadDoc.conversationThreads.addToSet(conversation._id);
    leadDoc.recordActivity({
      type: 'conversation_message',
      message: `Conversation started: "${initialMessage.trim().slice(0, 80)}${initialMessage.trim().length > 80 ? '...' : ''}"`,
      by: req.user._id,
      byName: req.user.name,
    });
    await leadDoc.save();
  }

  await conversation.populate([
    { path: 'inquirer', select: 'name email' },
    { path: 'owner', select: 'name email' },
    { path: 'property', select: 'title' },
    { path: 'messages.sender', select: 'name' },
  ]);

  res.status(201).json({
    success: true,
    message: 'Conversation started',
    conversation: maskOwnerIdentity(conversation, req.user.role === 'admin'),
  });
});

/**
 * @desc    Get all conversations (admin view)
 * @route   GET /api/conversations
 * @access  Private (admin only)
 */
const getConversations = asyncHandler(async (req, res) => {
  const { isActive = true, page = 1, limit = 10, search } = req.query;

  const query = {};
  if (isActive !== 'all') {
    query.isActive = isActive === 'true';
  }

  // Search by inquirer or owner name
  if (search) {
    // This is a simplified search - for better performance, use text indexes
    query.$or = [
      { 'inquirer.name': { $regex: search, $options: 'i' } },
      { 'owner.name': { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (page - 1) * limit;

  const [conversations, total] = await Promise.all([
    Conversation.find(query)
      .populate('inquirer', 'name email')
      .populate('owner', 'name email')
      .populate('property', 'title')
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Conversation.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: conversations.length,
    pagination: {
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      limit: parseInt(limit),
    },
    conversations,
  });
});

/**
 * @desc    Get conversations for current user (as inquirer or owner)
 * @route   GET /api/conversations/my-conversations
 * @access  Private
 */
const getMyConversations = asyncHandler(async (req, res) => {
  const { isActive = true, page = 1, limit = 10 } = req.query;

  const query = {
    $or: [{ inquirer: req.user._id }, { owner: req.user._id }],
  };

  if (isActive !== 'all') {
    query.isActive = isActive === 'true';
  }

  const skip = (page - 1) * limit;

  const [conversations, total] = await Promise.all([
    Conversation.find(query)
      .populate('inquirer', 'name email')
      .populate('owner', 'name email')
      .populate('property', 'title media.coverImage')
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Conversation.countDocuments(query),
  ]);

  const masked = conversations.map((conv) =>
    maskOwnerIdentity(conv, req.user.role === 'admin')
  );

  const withUnread = masked.map((conv) => ({
    // maskOwnerIdentity returns the raw mongoose doc for admins; the toObject
    // guard (same idiom as maskOwnerIdentity) guarantees a plain spread.
    ...(conv.toObject ? conv.toObject() : conv),
    unread: isUnreadForViewer(conv, req.user._id),
  }));

  res.json({
    success: true,
    count: withUnread.length,
    pagination: {
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      limit: parseInt(limit),
    },
    conversations: withUnread,
  });
});

/**
 * @desc    Aggregate unread-thread count for the current user (nav badge)
 * @route   GET /api/conversations/unread-count
 * @access  Private
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  // Participant-scoped, active threads only. We only need the fields the
  // unread rule uses, so the select keeps the payload tiny.
  const conversations = await Conversation.find({
    $or: [{ inquirer: req.user._id }, { owner: req.user._id }],
    isActive: true,
  }).select('inquirer owner messages.side lastMessageAt lastReadAt');

  const unreadCount = conversations.reduce(
    (total, conv) => total + (isUnreadForViewer(conv, req.user._id) ? 1 : 0),
    0
  );

  res.json({ success: true, unreadCount });
});

/**
 * @desc    Get a single conversation thread
 * @route   GET /api/conversations/:id
 * @access  Private (inquirer, owner, or admin)
 */
const getConversationById = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id)
    .populate('inquirer', 'name email')
    .populate('owner', 'name email')
    .populate('property', 'title slug media.coverImage')
    .populate('messages.sender', 'name');

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found',
    });
  }

  // Authorization
  const isInquirer = String(conversation.inquirer._id) === String(req.user._id);
  const isOwner = String(conversation.owner._id) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';

  if (!isAdmin && !isInquirer && !isOwner) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to view this conversation',
    });
  }

  // Opening the thread counts as reading it - stamp the viewer's side so the
  // unread badge clears. Admins who are not participants don't stamp.
  const viewerSide = isInquirer ? 'inquirer' : isOwner ? 'owner' : null;
  if (viewerSide) {
    conversation.lastReadAt = conversation.lastReadAt || {};
    conversation.lastReadAt[viewerSide] = new Date();
    await conversation.save();
  }

  res.json({
    success: true,
    conversation: maskOwnerIdentity(conversation, isAdmin),
  });
});

/**
 * @desc    Add a message to a conversation
 * @route   PATCH /api/conversations/:id/messages
 * @access  Private (inquirer or owner - admin acts on behalf of owner)
 */
const addMessage = asyncHandler(async (req, res) => {
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Message cannot be empty',
    });
  }

  const conversation = await Conversation.findById(req.params.id)
    .populate('inquirer', 'name')
    .populate('owner', 'name')
    .populate('property', 'title listedBy');

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found',
    });
  }

  // Determine sender side
  const isInquirer = String(conversation.inquirer._id) === String(req.user._id);
  const isOwner = String(conversation.owner._id) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';

  if (!isAdmin && !isInquirer && !isOwner) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to message in this conversation',
    });
  }

  // Determine which side is messaging
  const side = isAdmin || isOwner ? 'owner' : 'inquirer';
  const displayName =
    side === 'owner'
      ? conversation.property?.listedBy?.name || 'Ashland Estates'
      : req.user.name;

  // Add message
  conversation.messages.push({
    sender: req.user._id,
    senderName: displayName,
    side,
    body: message.trim(),
  });

  conversation.lastMessageAt = new Date();
  await conversation.save();

  // Keep the linked lead's activity trail in sync with the conversation
  if (conversation.lead) {
    const linkedLead = await Lead.findById(conversation.lead);
    if (linkedLead) {
      linkedLead.recordActivity({
        type: 'conversation_message',
        message: `${side === 'owner' ? 'Reply sent to' : 'Message from'} ${side === 'owner' ? conversation.inquirer ? conversation.inquirer.name : 'inquirer' : linkedLead.name}: "${message.trim().slice(0, 80)}${message.trim().length > 80 ? '...' : ''}"`,
        by: req.user._id,
        byName: req.user.name,
      });
      await linkedLead.save();
    }
  }

  await conversation.populate('messages.sender', 'name');

  // Send notifications
  if (side === 'owner') {
    // Admin replied on owner's behalf - notify inquirer
    await notify({
      recipient: conversation.inquirer._id,
      type: 'conversation_message',
      title: 'You have a new message',
      message: `${displayName} replied to your inquiry${
        conversation.property ? ` about "${conversation.property.title}"` : ''
      }`,
      conversation: conversation._id,
      link: '/my-conversations',
    });
  } else {
    // Inquirer sent a follow-up - notify admins
    const admins = await User.find({ role: 'admin' }).select('_id');
    await notifyMany(
      admins.map((a) => a._id),
      {
        type: 'conversation_followup',
        title: 'New message in conversation',
        message: `${req.user.name} replied in conversation${
          conversation.property ? ` about "${conversation.property.title}"` : ''
        }`,
        conversation: conversation._id,
        link: '/dashboard/admin/conversations',
      }
    );
  }

  res.json({
    success: true,
    message: 'Message sent',
    conversation: maskOwnerIdentity(conversation, isAdmin),
  });
});

/**
 * @desc    Mark conversation as resolved/inactive
 * @route   PATCH /api/conversations/:id/close
 * @access  Private (admin or owner)
 */
const closeConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found',
    });
  }

  // Only admin or owner can close
  const isAdmin = req.user.role === 'admin';
  const isOwner = String(conversation.owner) === String(req.user._id);

  if (!isAdmin && !isOwner) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to close this conversation',
    });
  }

  conversation.isActive = false;
  await conversation.save();

  res.json({
    success: true,
    message: 'Conversation closed',
    conversation,
  });
});

/**
 * @desc    Reopen a closed conversation
 * @route   PATCH /api/conversations/:id/reopen
 * @access  Private (admin only)
 */
const reopenConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findById(req.params.id);

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found',
    });
  }

  conversation.isActive = true;
  await conversation.save();

  res.json({
    success: true,
    message: 'Conversation reopened',
    conversation,
  });
});

/**
 * @desc    Delete a conversation
 * @route   DELETE /api/conversations/:id
 * @access  Private (admin only)
 */
const deleteConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findByIdAndDelete(req.params.id);

  if (!conversation) {
    return res.status(404).json({
      success: false,
      message: 'Conversation not found',
    });
  }

  res.json({
    success: true,
    message: 'Conversation deleted',
  });
});

module.exports = {
  createConversation,
  getConversations,
  getMyConversations,
  getUnreadCount,
  getConversationById,
  addMessage,
  closeConversation,
  reopenConversation,
  deleteConversation,
};