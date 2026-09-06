const ContactForm = require('../models/ContactForm');
const Lead = require('../models/Lead');
const Conversation = require('../models/Conversation');
const Property = require('../models/Property');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyMany } = require('../utils/notify');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;

/**
 * @desc    Submit a contact form / property inquiry
 * @route   POST /api/contact-forms
 * @access  Public (optional auth - recognizes logged-in user if present)
 */
const createContactForm = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message, property } = req.body;

  // Validation
  if (!name || !email || !message) {
    return res.status(400).json({
      success: false,
      message: 'Name, email, and message are required',
    });
  }

  if (!EMAIL_REGEX.test(email)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid email address',
    });
  }

  if (phone && !PHONE_REGEX.test(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Phone number must be exactly 10 digits',
    });
  }

  // Check if property exists and if user is trying to contact about their own listing
  let propertyDoc = null;
  if (property) {
    propertyDoc = await Property.findById(property).select('title listedBy status');

    if (!propertyDoc) {
      return res.status(404).json({
        success: false,
        message: 'Property not found',
      });
    }

    if (!propertyDoc.canReceiveInquiries()) {
      return res.status(400).json({
        success: false,
        message: 'This property has been sold and is no longer accepting inquiries.',
      });
    }

    // Prevent users from contacting themselves about their own listings
    if (req.user && String(propertyDoc.listedBy) === String(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: "You can't send an inquiry about your own property listing",
      });
    }
  }

  // Create contact form
  const contactForm = await ContactForm.create({
    name,
    email,
    phone: phone || '',
    subject: subject || 'General Inquiry',
    message,
    property: property || null,
    user: req.user ? req.user._id : null,
    status: 'new',
  });

  // Notify admins about new contact form
  const admins = await User.find({ role: 'admin' }).select('_id');

  if (propertyDoc) {
    await notifyMany(
      admins.map((a) => a._id),
      {
        type: 'contact_form_received',
        title: 'New contact form submission',
        message: `${name} sent an inquiry about "${propertyDoc.title}"`,
        contactForm: contactForm._id,
        property: propertyDoc._id,
        link: '/dashboard/admin/lead-management',
      }
    );
  } else {
    await notifyMany(
      admins.map((a) => a._id),
      {
        type: 'contact_form_received',
        title: 'New contact message',
        message: `${name} sent a general inquiry: "${subject || 'General Inquiry'}"`,
        contactForm: contactForm._id,
        link: '/dashboard/admin/lead-management',
      }
    );
  }

  res.status(201).json({
    success: true,
    message: 'Your contact form has been submitted successfully',
    contactForm,
  });
});

/**
 * @desc    Get all contact forms - admin inbox
 * @route   GET /api/contact-forms
 * @access  Private (admin only)
 */
const getContactForms = asyncHandler(async (req, res) => {
  const { status, property, page = 1, limit = 10 } = req.query;

  const query = {};
  if (status) query.status = status;
  if (property) query.property = property;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10)), 200);
  const skip = (pageNum - 1) * limitNum;

  const [contactForms, total] = await Promise.all([
    ContactForm.find(query)
      .populate('property', 'title slug')
      .populate('user', 'name email')
      .populate('respondedBy', 'name')
      .populate('convertedLead', 'stage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    ContactForm.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: contactForms.length,
    pagination: {
      total,
      pages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      limit: limitNum,
    },
    contactForms,
  });
});

/**
 * @desc    Get contact forms sent by the current user
 * @route   GET /api/contact-forms/sent
 * @access  Private
 */
const getSentContactForms = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10)), 200);
  const skip = (pageNum - 1) * limitNum;

  const [contactForms, total] = await Promise.all([
    ContactForm.find({ user: req.user._id })
      .populate('property', 'title slug media.coverImage')
      .populate('respondedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    ContactForm.countDocuments({ user: req.user._id }),
  ]);

  res.json({
    success: true,
    count: contactForms.length,
    pagination: {
      total,
      pages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      limit: limitNum,
    },
    contactForms,
  });
});

/**
 * @desc    Get a single contact form
 * @route   GET /api/contact-forms/:id
 * @access  Private (original sender or admin)
 */
const getContactFormById = asyncHandler(async (req, res) => {
  const contactForm = await ContactForm.findById(req.params.id)
    .populate('property', 'title slug media.coverImage')
    .populate('user', 'name email')
    .populate('respondedBy', 'name')
    .populate('convertedLead', 'name stage source');

  if (!contactForm) {
    return res.status(404).json({
      success: false,
      message: 'Contact form not found',
    });
  }

  // Authorization: only the sender or admins can view
  const isSender = contactForm.user && String(contactForm.user._id) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';

  if (!isAdmin && !isSender) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to view this contact form',
    });
  }

  res.json({
    success: true,
    contactForm,
  });
});

/**
 * @desc    Update contact form status (new, read, responded, converted)
 * @route   PATCH /api/contact-forms/:id/status
 * @access  Private (admin only)
 */
const updateContactFormStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!['new', 'read', 'responded', 'converted'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid status. Must be one of: new, read, responded, converted',
    });
  }

  const contactForm = await ContactForm.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  ).populate('property', 'title').populate('respondedBy', 'name');

  if (!contactForm) {
    return res.status(404).json({
      success: false,
      message: 'Contact form not found',
    });
  }

  res.json({
    success: true,
    message: 'Contact form status updated',
    contactForm,
  });
});

/**
 * @desc    Add a response to a contact form
 * @route   PATCH /api/contact-forms/:id/respond
 * @access  Private (admin only)
 */
const respondToContactForm = asyncHandler(async (req, res) => {
  const { response } = req.body;

  if (!response || !response.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Response message is required',
    });
  }

  const contactForm = await ContactForm.findById(req.params.id).populate('user');

  if (!contactForm) {
    return res.status(404).json({
      success: false,
      message: 'Contact form not found',
    });
  }

  // Update response
  contactForm.response = response.trim();
  contactForm.respondedAt = new Date();
  contactForm.respondedBy = req.user._id;
  contactForm.status = 'responded';
  await contactForm.save();

  // Notify the original sender if they're a registered user
  if (contactForm.user) {
    await notify({
      recipient: contactForm.user,
      type: 'contact_form_responded',
      title: 'Response to your contact form',
      message: `Your inquiry has been responded to${contactForm.property ? ` about "${contactForm.property.title}"` : ''}`,
      contactForm: contactForm._id,
      link: '/my-inquiries',
    });
  }

  // Also send email if we have their email
  if (contactForm.email) {
    // Implement email sending here if needed
    // await sendEmail(contactForm.email, 'Response to Your Inquiry', response);
  }

  res.json({
    success: true,
    message: 'Response sent',
    contactForm,
  });
});

/**
 * @desc    Convert a contact form submission into a pipeline Lead
 * @route   POST /api/contact-forms/:id/convert-to-lead
 * @access  Private (admin only)
 *
 * Pulls name/email/phone straight from the submission, creates the Lead with
 * source 'contact_form', opens a unified Conversation seeded with the
 * original message (when the sender is a registered user), and links both
 * records back to each other.
 */
const convertContactFormToLead = asyncHandler(async (req, res) => {
  const { category, priority, assignedAgent, notes, property } = req.body;

  const contactForm = await ContactForm.findById(req.params.id).populate('user', 'name email');
  if (!contactForm) {
    return res.status(404).json({ success: false, message: 'Contact form not found' });
  }

  if (contactForm.status === 'converted' && contactForm.convertedLead) {
    return res.status(400).json({
      success: false,
      message: 'This contact form has already been converted to a lead',
      leadId: contactForm.convertedLead,
    });
  }

  // Validate agent if provided
  let agentDoc = null;
  if (assignedAgent) {
    agentDoc = await User.findById(assignedAgent).select('name email');
    if (!agentDoc) {
      return res.status(404).json({ success: false, message: 'Assigned agent not found' });
    }
  }

  const propertyId = property || contactForm.property || null;
  if (propertyId) {
    const propertyDoc = await Property.findById(propertyId).select('title');
    if (!propertyDoc) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }
  }

  // 1) Create the lead
  const lead = new Lead({
    name: contactForm.name,
    email: contactForm.email,
    phone: contactForm.phone || '',
    source: 'contact_form',
    contactForm: contactForm._id,
    user: contactForm.user ? contactForm.user._id : null,
    property: propertyId,
    assignedAgent: assignedAgent || null,
    category: category || 'property',
    priority: priority || 'medium',
    stage: 'new',
    notes: notes
      ? `Converted from contact form: ${notes}`
      : `Converted from contact form: "${contactForm.subject}"`,
  });
  lead.recordActivity({
    type: 'converted',
    message: `Lead created from contact form "${contactForm.subject}"`,
    by: req.user._id,
    byName: req.user.name,
  });
  await lead.save();

  // 2) Open a unified conversation seeded with the original message
  let conversation = null;
  if (contactForm.user) {
    conversation = await Conversation.create({
      lead: lead._id,
      inquirer: contactForm.user._id,
      owner: assignedAgent || req.user._id,
      property: propertyId,
      messages: [
        {
          sender: contactForm.user._id,
          senderName: contactForm.name,
          side: 'inquirer',
          body: contactForm.message,
        },
      ],
      lastMessageAt: contactForm.createdAt || new Date(),
      isActive: true,
    });
    lead.conversationThreads.push(conversation._id);
    await lead.save();
  }

  // 3) Mark the form as converted and cross-link
  contactForm.status = 'converted';
  contactForm.convertedLead = lead._id;
  await contactForm.save();

  // 4) Notify the assigned agent
  if (agentDoc) {
    await notify({
      recipient: agentDoc._id,
      type: 'lead_assigned',
      title: 'New Lead Assigned to You',
      message: `Lead "${lead.name}" (from a contact form) has been assigned to you`,
      lead: lead._id,
      link: '/dashboard/agent/leads',
    });
  }

  await lead.populate([
    { path: 'assignedAgent', select: 'name email' },
    { path: 'property', select: 'title' },
    { path: 'contactForm', select: 'subject status' },
  ]);

  res.status(201).json({
    success: true,
    message: 'Contact form converted to lead',
    lead,
    conversation,
  });
});

/**
 * @desc    Delete a contact form
 * @route   DELETE /api/contact-forms/:id
 * @access  Private (admin only)
 */
const deleteContactForm = asyncHandler(async (req, res) => {
  const contactForm = await ContactForm.findByIdAndDelete(req.params.id);

  if (!contactForm) {
    return res.status(404).json({
      success: false,
      message: 'Contact form not found',
    });
  }

  res.json({
    success: true,
    message: 'Contact form deleted',
  });
});

module.exports = {
  createContactForm,
  getContactForms,
  getSentContactForms,
  getContactFormById,
  updateContactFormStatus,
  respondToContactForm,
  convertContactFormToLead,
  deleteContactForm,
};
