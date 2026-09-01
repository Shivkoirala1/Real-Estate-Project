const Visit = require('../models/Visit');
const Property = require('../models/Property');
const Inquiry = require('../models/Inquiry');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyMany } = require('../utils/notify');

// Helper: Strips sensitive admin fields (like internal seller coordination notes)
// when the response is viewed by a non-admin/agent.
const sanitizeVisitForViewer = (visit, viewerIsAdmin) => {
  if (viewerIsAdmin) return visit;
  const plain = visit.toObject ? visit.toObject() : visit;
  delete plain.internalNotes;
  return plain;
};

// @desc    Request a property site visit or office visit
// @route   POST /api/visits
// @access  Private (Buyer)
const createVisit = asyncHandler(async (req, res) => {
  const { property, requestedSlot, buyerNotes, inquiryId, visitType = 'property' } = req.body;

  if (!requestedSlot) {
    return res.status(400).json({
      success: false,
      message: 'Requested date/time slot is required',
    });
  }

  if (visitType === 'property' && !property) {
    return res.status(400).json({
      success: false,
      message: 'Property ID is required for property site visits',
    });
  }

  const slotDate = new Date(requestedSlot);
  if (isNaN(slotDate.getTime()) || slotDate < new Date()) {
    return res.status(400).json({
      success: false,
      message: 'Please provide a valid future date and time slot',
    });
  }

  let propertyDoc = null;
  if (property) {
    propertyDoc = await Property.findById(property).select('title listedBy');
    if (!propertyDoc) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    if (String(propertyDoc.listedBy) === String(req.user._id)) {
      return res.status(400).json({
        success: false,
        message: 'You cannot request a visit for your own property listing',
      });
    }
  }

  const visit = await Visit.create({
    visitType,
    property: property || null,
    requestedBy: req.user._id,
    requestedSlot: slotDate,
    buyerNotes: buyerNotes || '',
    status: 'pending_agent_review',
  });

  // Sync with linked Inquiry/Lead record
  if (inquiryId) {
    await Inquiry.findByIdAndUpdate(inquiryId, {
      visitId: visit._id,
      stage: visitType === 'office' ? 'Office Visit Scheduled' : 'Site Visit Scheduled',
    });
  } else if (property) {
    const existingInquiry = await Inquiry.findOne({
      user: req.user._id,
      property,
    }).sort({ createdAt: -1 });

    if (existingInquiry) {
      existingInquiry.visitId = visit._id;
      existingInquiry.stage = visitType === 'office' ? 'Office Visit Scheduled' : 'Site Visit Scheduled';
      await existingInquiry.save();
    }
  }

  // Notify admins/agents
  const admins = await User.find({ role: 'admin' }).select('_id');
  const visitTypeName = visitType === 'office' ? 'Office Meeting' : 'Site Visit';
  const targetLabel = propertyDoc ? ` regarding "${propertyDoc.title}"` : '';

  await notifyMany(
    admins.map((a) => a._id),
    {
      type: 'visit_requested',
      title: `New ${visitTypeName} Requested`,
      message: `${req.user.name} requested an ${visitTypeName.toLowerCase()}${targetLabel}`,
      visit: visit._id,
      property: propertyDoc ? propertyDoc._id : null,
      link: '/dashboard/admin/visits',
    }
  );

  res.status(201).json({
    success: true,
    message: `${visitTypeName} request submitted successfully`,
    visit,
  });
});

// @desc    Get central visit moderation queue (Paginated)
// @route   GET /api/visits
// @access  Private (Admin / Staff)
const getVisits = asyncHandler(async (req, res) => {
  const { 
  status, 
  assignedAgent, 
  visitType, 
  property, 
  page = 1, 
  limit = 10 
} = req.query;

const query = {};

if (status) query.status = status;
if (assignedAgent) query.assignedAgent = assignedAgent;
if (visitType) query.visitType = visitType;
if (property) query.property = property;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.max(1, parseInt(limit, 10));
  const startIndex = (pageNum - 1) * limitNum;

  const total = await Visit.countDocuments(query);

  const visits = await Visit.find(query)
    .populate('property', 'title slug media.coverImage address district')
    .populate('requestedBy', 'name email phone')
    .populate('assignedAgent', 'name email')
    .sort({ requestedSlot: 1 })
    .skip(startIndex)
    .limit(limitNum);

  res.json({
    success: true,
    count: visits.length,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      limit: limitNum,
    },
    visits,
  });
});

// @desc    Get user's own requested visits (Paginated)
// @route   GET /api/visits/my-visits
// @access  Private (Buyer)
const getMyVisits = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;

  const query = { requestedBy: req.user._id };
  if (status) query.status = status;

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.max(1, parseInt(limit, 10));
  const startIndex = (pageNum - 1) * limitNum;

  const total = await Visit.countDocuments(query);

  const visits = await Visit.find(query)
    .populate('property', 'title slug media.coverImage address city')
    .populate('assignedAgent', 'name phone email')
    .sort({ requestedSlot: -1 })
    .skip(startIndex)
    .limit(limitNum);

  const sanitizedVisits = visits.map((v) => sanitizeVisitForViewer(v, false));

  res.json({
    success: true,
    count: sanitizedVisits.length,
    pagination: {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      limit: limitNum,
    },
    visits: sanitizedVisits,
  });
});

// @desc    Get single visit details
// @route   GET /api/visits/:id
// @access  Private (Requester or Admin)
const getVisitById = asyncHandler(async (req, res) => {
  const visit = await Visit.findById(req.params.id)
    .populate('property', 'title slug media.coverImage address listedBy')
    .populate('requestedBy', 'name email phone')
    .populate('assignedAgent', 'name email phone');

  if (!visit) {
    return res.status(404).json({ success: false, message: 'Visit request not found' });
  }

  const isRequester = String(visit.requestedBy._id) === String(req.user._id);
  const isAdmin = req.user.role === 'admin';

  if (!isRequester && !isAdmin) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this visit request',
    });
  }

  res.json({
    success: true,
    visit: sanitizeVisitForViewer(visit, isAdmin),
  });
});

// @desc    Update visit status / assign agent (Middleman coordination)
// @route   PATCH /api/visits/:id
// @access  Private (Admin)
const updateVisit = asyncHandler(async (req, res) => {
  const { status, internalNotes, assignedAgent, requestedSlot } = req.body;

  const visit = await Visit.findById(req.params.id).populate('property', 'title');
  if (!visit) {
    return res.status(404).json({ success: false, message: 'Visit request not found' });
  }

  const previousStatus = visit.status;

  if (status) visit.status = status;
  if (internalNotes !== undefined) visit.internalNotes = internalNotes;
  if (assignedAgent !== undefined) visit.assignedAgent = assignedAgent;
  if (requestedSlot) visit.requestedSlot = new Date(requestedSlot);

  await visit.save();

  // Sync stage on linked Inquiry if status changes
  if (status && status !== previousStatus) {
    const linkedInquiry = await Inquiry.findOne({ visitId: visit._id });
    if (linkedInquiry) {
      if (status === 'confirmed') linkedInquiry.stage = 'Site Visit Scheduled';
      if (status === 'completed') linkedInquiry.stage = 'Negotiation';
      if (status === 'rejected' || status === 'cancelled') linkedInquiry.stage = 'Lost';
      if (assignedAgent) linkedInquiry.assignedAgent = assignedAgent;
      await linkedInquiry.save();
    }
  }

  // Notify buyer on status update
if (status && status !== previousStatus) {
  const isOfficeVisit = visit.visitType === 'office';

  const visitLabel = isOfficeVisit
    ? 'office consultation'
    : 'site visit';

  const propertyTitle = visit.property?.title;

  const targetLabel = propertyTitle
    ? `"${propertyTitle}"`
    : 'your office consultation';

  let notificationTitle = 'Visit Status Update';

  let notificationMessage =
    `Your ${visitLabel} ${propertyTitle ? `for ${targetLabel} ` : ''}` +
    `status is now: ${status.replace('_', ' ')}.`;

  if (status === 'confirmed') {
    notificationTitle = isOfficeVisit
      ? 'Office Consultation Confirmed!'
      : 'Site Visit Confirmed!';

    notificationMessage = isOfficeVisit
      ? `Your office consultation on ${new Date(
          visit.requestedSlot
        ).toLocaleString()} has been confirmed.`
      : `Your site visit for ${targetLabel} on ${new Date(
          visit.requestedSlot
        ).toLocaleString()} has been confirmed.`;
  } else if (status === 'rejected') {
    notificationTitle = isOfficeVisit
      ? 'Office Consultation Request Declined'
      : 'Site Visit Request Declined';

    notificationMessage = isOfficeVisit
      ? `Your office consultation request could not be confirmed for the requested slot.`
      : `Your site visit request for ${targetLabel} could not be confirmed for the requested slot.`;
  }

  await notify({
    recipient: visit.requestedBy,
    type: `visit_${status}`,
    title: notificationTitle,
    message: notificationMessage,
    visit: visit._id,
    property: visit.property?._id || null,
    link: '/my-visits',
  });
}

  res.json({
    success: true,
    message: 'Visit updated successfully',
    visit,
  });
});

// @desc    Cancel a visit request
// @route   PATCH /api/visits/:id/cancel
// @access  Private (Buyer requester)
const cancelMyVisit = asyncHandler(async (req, res) => {
  const visit = await Visit.findById(req.params.id);

  if (!visit) {
    return res.status(404).json({ success: false, message: 'Visit request not found' });
  }

  if (String(visit.requestedBy) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Not authorized to cancel this visit' });
  }

  if (visit.status === 'completed' || visit.status === 'cancelled') {
    return res.status(400).json({
      success: false,
      message: `Cannot cancel a visit that is already ${visit.status}`,
    });
  }

  visit.status = 'cancelled';
  await visit.save();

  // Notify admins of cancellation
  const admins = await User.find({ role: 'admin' }).select('_id');
  await notifyMany(
    admins.map((a) => a._id),
    {
      type: 'visit_cancelled',
      title: 'Visit Cancelled by Buyer',
      message: `A site visit request was cancelled by the buyer`,
      visit: visit._id,
      property: visit.property,
      link: '/dashboard/admin/visits',
    }
  );

  res.json({
    success: true,
    message: 'Visit request cancelled successfully',
    visit: sanitizeVisitForViewer(visit, false),
  });
});

module.exports = {
  createVisit,
  getVisits,
  getMyVisits,
  getVisitById,
  updateVisit,
  cancelMyVisit,
};