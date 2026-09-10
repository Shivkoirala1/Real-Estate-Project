const Visit = require('../models/Visit');
const Property = require('../models/Property');
const Lead = require('../models/Lead');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyMany } = require('../utils/notify');

// Map visit status changes onto the linked lead's pipeline stage so the
// pipeline stays in sync with the visit lifecycle.
const stageForVisitStatus = (status) => {
  switch (status) {
    case 'confirmed':
      return 'site_visit_scheduled';
    case 'completed':
      return 'negotiation';
    case 'rejected':
    case 'cancelled':
      return 'lost';
    default:
      return null;
  }
};

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
  const { property, requestedSlot, buyerNotes, leadId, visitType = 'property' } = req.body;

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
    propertyDoc = await Property.findById(property).select('title listedBy status');
    if (!propertyDoc) {
      return res.status(404).json({ success: false, message: 'Property not found' });
    }

    if (!propertyDoc.canReceiveInquiries()) {
      return res.status(400).json({
        success: false,
        message: 'This property has been sold and is no longer accepting visit requests.',
      });
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

  // Sync with a linked Lead record (created via "Convert to Lead" earlier).
  // `leadId` may be passed explicitly, otherwise we look for the buyer's most
  // recent lead tied to the same property.
  let linkedLead = null;
  if (leadId) {
    linkedLead = await Lead.findById(leadId);
  } else if (property) {
    linkedLead = await Lead.findOne({ user: req.user._id, property }).sort({ createdAt: -1 });
  }
  if (linkedLead) {
    linkedLead.visit = visit._id;
    linkedLead.stage = 'site_visit_scheduled';
    linkedLead.recordActivity({
      type: 'stage_changed',
      message: `${visitType === 'office' ? 'Office visit' : 'Site visit'} scheduled for ${slotDate.toLocaleString()}`,
      by: req.user._id,
      byName: req.user.name,
    });
    await linkedLead.save();
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

// Surfaces the items that most need a human decision first; everything else
// falls back to chronological order within its own priority tier.
const VISIT_STATUS_PRIORITY = {
  pending_agent_review: 0,
  confirmed: 1,
  completed: 2,
  rejected: 3,
  cancelled: 3,
};

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

  let visits;
  if (status) {
    // Single-status view: plain chronological DB pagination is fine.
    visits = await Visit.find(query)
      .populate('property', 'title slug media.coverImage address district')
      .populate('requestedBy', 'name email phone')
      .populate('assignedAgent', 'name email')
      .sort({ requestedSlot: 1 })
      .skip(startIndex)
      .limit(limitNum);
  } else {
    // Mixed view: prioritize the queue (pending reviews first) before
    // pagination, which requires seeing the full result set.
    const all = await Visit.find(query)
      .populate('property', 'title slug media.coverImage address district')
      .populate('requestedBy', 'name email phone')
      .populate('assignedAgent', 'name email')
      .sort({ requestedSlot: 1 });

    all.sort(
      (a, b) =>
        (VISIT_STATUS_PRIORITY[a.status] ?? 9) - (VISIT_STATUS_PRIORITY[b.status] ?? 9) ||
        new Date(a.requestedSlot) - new Date(b.requestedSlot)
    );

    visits = all.slice(startIndex, startIndex + limitNum);
  }

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

  // Sync stage on the linked Lead if status changes
  if (status && status !== previousStatus) {
    const linkedLead = await Lead.findOne({ visit: visit._id });
    if (linkedLead) {
      const newStage = stageForVisitStatus(status);
      if (newStage && newStage !== linkedLead.stage) {
        linkedLead.stage = newStage;
        linkedLead.recordActivity({
          type: 'stage_changed',
          message: `Visit ${status.replace(/_/g, ' ')} - stage moved to "${newStage.replace(/_/g, ' ')}"`,
          by: req.user._id,
          byName: req.user.name,
        });
      }
      if (assignedAgent && !linkedLead.assignedAgent) linkedLead.assignedAgent = assignedAgent;
      await linkedLead.save();
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

/**
 * @desc    Convert a visit request into a pipeline Lead
 * @route   POST /api/visits/:id/convert-to-lead
 * @access  Private (admin only)
 *
 * Creates a Lead with source 'property_visit' / 'office_visit', links the
 * visit and property records, and defaults the stage to
 * 'site_visit_scheduled' since a visit was already booked.
 */
const convertVisitToLead = asyncHandler(async (req, res) => {
  const { category, priority, assignedAgent, notes, stage } = req.body;

  const visit = await Visit.findById(req.params.id)
    .populate('requestedBy', 'name email phone')
    .populate('property', 'title');

  if (!visit) {
    return res.status(404).json({ success: false, message: 'Visit request not found' });
  }

  const existingLead = await Lead.findOne({ visit: visit._id });
  if (existingLead) {
    return res.status(400).json({
      success: false,
      message: 'This visit has already been converted to a lead',
      leadId: existingLead._id,
    });
  }

  let agentDoc = null;
  const agentId = assignedAgent || visit.assignedAgent || null;
  if (agentId) {
    agentDoc = await User.findById(agentId).select('name email');
    if (!agentDoc) {
      return res.status(404).json({ success: false, message: 'Assigned agent not found' });
    }
  }

  const source = visit.visitType === 'office' ? 'office_visit' : 'property_visit';
  const initialStage = stage ? Lead.normalizeStage(stage) || 'site_visit_scheduled' : 'site_visit_scheduled';

  const lead = new Lead({
    name: visit.requestedBy ? visit.requestedBy.name : 'Unknown visitor',
    email: visit.requestedBy ? visit.requestedBy.email : 'unknown@visit.local',
    phone: visit.requestedBy ? visit.requestedBy.phone || '' : '',
    source,
    visit: visit._id,
    property: visit.property ? visit.property._id : null,
    user: visit.requestedBy ? visit.requestedBy._id : null,
    assignedAgent: agentId,
    category: category || 'property',
    priority: priority || 'high',
    stage: initialStage,
    notes: notes
      ? `Converted from ${visit.visitType === 'office' ? 'office visit' : 'property visit'}: ${notes}`
      : `Converted from ${visit.visitType === 'office' ? 'office visit' : 'property visit'} scheduled for ${new Date(visit.requestedSlot).toLocaleString()}`,
  });
  lead.recordActivity({
    type: 'converted',
    message: `Lead created from ${visit.visitType === 'office' ? 'office visit' : 'property visit'} on ${new Date(visit.requestedSlot).toLocaleDateString()}`,
    by: req.user._id,
    byName: req.user.name,
  });
  await lead.save();

  // Tag the visit with internal notes pointing at the lead for traceability
  visit.internalNotes = `${visit.internalNotes ? visit.internalNotes + '\n' : ''}Converted to lead ${lead._id} on ${new Date().toISOString()}`;
  await visit.save();

  if (agentDoc) {
    await notify({
      recipient: agentDoc._id,
      type: 'lead_assigned',
      title: 'New Lead Assigned to You',
      message: `Lead "${lead.name}" (from a visit request) has been assigned to you`,
      lead: lead._id,
      link: '/dashboard/agent/leads',
    });
  }

  await lead.populate([
    { path: 'assignedAgent', select: 'name email' },
    { path: 'property', select: 'title' },
    { path: 'visit', select: 'visitType requestedSlot status' },
    { path: 'user', select: 'name email' },
  ]);

  res.status(201).json({
    success: true,
    message: 'Visit converted to lead',
    lead,
  });
});

module.exports = {
  createVisit,
  getVisits,
  getMyVisits,
  getVisitById,
  updateVisit,
  cancelMyVisit,
  convertVisitToLead,
};