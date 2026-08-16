const Inquiry = require('../models/Inquiry');
const Property = require('../models/Property');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyMany } = require('../utils/notify');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

// Owner-side messages are always actually sent by an admin standing in for
// the property poster. `senderName` already carries the display name the
// buyer should see (the poster's name, or a neutral platform name) - this
// strips the populated `sender` user object (which would otherwise expose
// the admin's real account name/id in the raw API response) whenever the
// person viewing the thread isn't an admin themselves.
const maskOwnerIdentity = (inquiry, viewerIsAdmin) => {
  if (viewerIsAdmin) return inquiry;
  const plain = inquiry.toObject ? inquiry.toObject() : inquiry;
  plain.messages = (plain.messages || []).map((m) =>
    m.side === 'owner' ? { ...m, sender: undefined } : m
  );
  if (plain.respondedBy) plain.respondedBy = undefined;
  return plain;
};

// @desc    Submit a contact form / property inquiry
// @route   POST /api/inquiries
// @access  Public (optionalAuth - recognizes a logged-in sender if there is one)
const createInquiry = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message, property } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ success: false, message: 'Name, email and message are required' });
  }
  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
  }
  if (phone && !PHONE_REGEX.test(phone)) {
    return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits' });
  }

  let propertyDoc = null;
  if (property) {
    propertyDoc = await Property.findById(property).select('title listedBy');

    // A poster can't send an inquiry to themselves about their own listing -
    // this should already be hidden in the UI, but enforce it server-side too.
    if (propertyDoc && req.user && String(propertyDoc.listedBy) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: "You can't send an inquiry about your own property listing" });
    }
  }

  const inquiry = await Inquiry.create({
    name,
    email,
    phone,
    subject,
    message,
    property: property || null,
    user: req.user ? req.user._id : null,
    messages: [
      {
        sender: req.user ? req.user._id : null,
        senderName: name,
        side: 'inquirer',
        body: message,
      },
    ],
  });

  // Notify admins - inquiries are handled centrally by the admin team rather
  // than going straight to whichever user happened to post the property.
  const admins = await User.find({ role: 'admin' }).select('_id');
  if (propertyDoc) {
    await notifyMany(
      admins.map((a) => a._id),
      {
        type: 'inquiry_received',
        title: 'New inquiry received',
        message: `${name} sent an inquiry about "${propertyDoc.title}"`,
        inquiry: inquiry._id,
        property: propertyDoc._id,
        link: '/dashboard/admin/inquiries',
      }
    );
  } else {
    // General contact-form message with no specific property
    await notifyMany(
      admins.map((a) => a._id),
      {
        type: 'inquiry_received',
        title: 'New contact message',
        message: `${name} sent a general inquiry: "${subject || 'General Inquiry'}"`,
        inquiry: inquiry._id,
        link: '/dashboard/admin/inquiries',
      }
    );
  }

  res.status(201).json({ success: true, message: 'Your inquiry has been submitted successfully', inquiry });
});

// @desc    Get all inquiries - admin's central inbox. Inquiries are handled
// entirely by the admin team; the property owner never gets direct access
// to the thread, so there is no "my properties' inquiries" view here anymore.
// @route   GET /api/inquiries
// @access  Private (admin only)
const getInquiries = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const query = status ? { status } : {};

  const inquiries = await Inquiry.find(query)
    .populate('property', 'title slug')
    .populate('messages.sender', 'name')
    .sort({ createdAt: -1 });
  res.json({ success: true, count: inquiries.length, inquiries });
});

// @desc    Get inquiries the current user has personally sent (as an inquirer)
// @route   GET /api/inquiries/sent
// @access  Private
const getSentInquiries = asyncHandler(async (req, res) => {
  const inquiries = await Inquiry.find({ user: req.user._id })
    .populate('property', 'title slug media.coverImage')
    .populate('respondedBy', 'name')
    .populate('messages.sender', 'name')
    .sort({ createdAt: -1 });
  const masked = inquiries.map((inq) => maskOwnerIdentity(inq, req.user.role === 'admin'));
  res.json({ success: true, count: masked.length, inquiries: masked });
});

// @desc    Get a single inquiry with its full conversation thread
// @route   GET /api/inquiries/:id
// @access  Private (the original sender, or an admin - never the property owner directly)
const getInquiryById = asyncHandler(async (req, res) => {
  const inquiry = await Inquiry.findById(req.params.id)
    .populate('property', 'title slug listedBy media.coverImage')
    .populate('messages.sender', 'name');
  if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });

  const isSender = inquiry.user && String(inquiry.user) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && !isSender) {
    return res.status(403).json({ success: false, message: 'You are not authorized to view this inquiry' });
  }

  res.json({ success: true, inquiry: maskOwnerIdentity(inquiry, isAdmin) });
});

// @desc    Update inquiry status (mark as read/responded)
// @route   PATCH /api/inquiries/:id
// @access  Private (admin, staff)
const updateInquiryStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const inquiry = await Inquiry.findById(req.params.id);
  if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });

  inquiry.status = status;
  await inquiry.save();

  // Inquiry activity is handled centrally by admins - regular users (the
  // inquirer or the property owner) must never receive a notification about
  // it, so no notify() call happens here on purpose.

  res.json({ success: true, inquiry });
});

// @desc    Add a message to an inquiry's conversation thread. Works for BOTH
//          sides: the admin replying on the poster's behalf, or the original
//          inquirer sending a follow-up - real two-way back-and-forth.
//
//          Property owners never get direct access to this thread - all
//          "owner side" replies are actually sent by an admin. To keep the
//          conversation looking like a normal buyer-seller exchange (not a
//          support ticket), the admin's real name is never stored or shown;
//          the reply is labeled with the property's poster's name instead
//          (or a neutral platform name for general contact messages with no
//          specific listing attached).
// @route   PATCH /api/inquiries/:id/reply
// @access  Private (the original sender, or an admin)
const replyToInquiry = asyncHandler(async (req, res) => {
  const { message } = req.body;
  const body = (message || req.body.response || '').trim();
  if (!body) {
    return res.status(400).json({ success: false, message: 'A message is required' });
  }

  const inquiry = await Inquiry.findById(req.params.id).populate({
    path: 'property',
    select: 'title listedBy',
    populate: { path: 'listedBy', select: 'name' },
  });
  if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });

  const isSender = inquiry.user && String(inquiry.user) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';

  if (!isSender && !isAdmin) {
    return res.status(403).json({ success: false, message: 'You are not authorized to reply to this inquiry' });
  }

  // Admins reply from the "owner" side (standing in for whoever posted the
  // property); the original inquirer replies from the "inquirer" side.
  const side = isAdmin ? 'owner' : 'inquirer';
  const displayName = side === 'owner'
    ? (inquiry.property?.listedBy?.name || 'Ashland Estates')
    : req.user.name;

  inquiry.messages.push({
    sender: req.user._id,
    senderName: displayName,
    side,
    body,
  });

  if (side === 'owner') {
    // Keep the legacy single-reply fields in sync for any old UI/data reads
    inquiry.response = body;
    inquiry.respondedAt = new Date();
    inquiry.respondedBy = req.user._id;
    inquiry.status = 'responded';
  } else if (inquiry.status === 'responded') {
    // The inquirer followed up after a response - it's now awaiting the
    // owner's attention again.
    inquiry.status = 'read';
  }

  await inquiry.save();

  // Notify the original inquirer when the admin replies on the property
  // poster's behalf - the buyer needs to know they got a response, even
  // though (by design) they never learn it actually came from an admin
  // rather than the poster directly. Admins are notified separately when
  // the *inquirer* is the one who follows up, since inquiries are handled
  // centrally by the admin team.
  if (side === 'owner') {
    if (inquiry.user) {
      await notify({
        recipient: inquiry.user,
        type: 'inquiry_responded',
        title: 'You received a reply',
        message: `${displayName} replied to your inquiry${inquiry.property ? ` about "${inquiry.property.title}"` : ''}`,
        inquiry: inquiry._id,
        property: inquiry.property ? inquiry.property._id : null,
        link: '/my-properties/inquiries?tab=sent',
      });
    }
  } else if (inquiry.property && inquiry.property.listedBy) {
    // Inquiries are handled centrally by admins, same as the initial message.
    const admins = await User.find({ role: 'admin' }).select('_id');
    await notifyMany(
      admins.map((a) => a._id),
      {
        type: 'inquiry_followup',
        title: 'New reply to an inquiry',
        message: `${req.user.name} replied about "${inquiry.property.title}"`,
        inquiry: inquiry._id,
        property: inquiry.property._id,
        link: '/dashboard/admin/inquiries',
      }
    );
  } else {
    // General inquiry with no property owner - notify admins instead
    const admins = await User.find({ role: 'admin' }).select('_id');
    await notifyMany(
      admins.map((a) => a._id),
      {
        type: 'inquiry_followup',
        title: 'New reply on a contact message',
        message: `${req.user.name} added a reply to an inquiry thread`,
        inquiry: inquiry._id,
        link: '/dashboard/admin/inquiries',
      }
    );
  }

  res.json({ success: true, message: 'Reply sent', inquiry });
});

// @desc    Delete an inquiry
// @route   DELETE /api/inquiries/:id
// @access  Private (admin)
const deleteInquiry = asyncHandler(async (req, res) => {
  const inquiry = await Inquiry.findByIdAndDelete(req.params.id);
  if (!inquiry) return res.status(404).json({ success: false, message: 'Inquiry not found' });
  res.json({ success: true, message: 'Inquiry deleted' });
});

module.exports = {
  createInquiry,
  getInquiries,
  getSentInquiries,
  getInquiryById,
  updateInquiryStatus,
  respondToInquiry: replyToInquiry, // backward-compatible alias for the old /respond route
  replyToInquiry,
  deleteInquiry,
};
