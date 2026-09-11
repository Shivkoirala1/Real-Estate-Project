const Visit = require('../models/Visit');
const Property = require('../models/Property');
const Lead = require('../models/Lead');
const ContactForm = require('../models/ContactForm');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyMany } = require('../utils/notify');
const { ensureLeadFromVisit } = require('../utils/leadAutoConversion');

// Lead stages that can still absorb new activity (visit linking). Closed/lost
// leads are never silently resurrected - a returning customer starts fresh.
const ACTIVE_LEAD_STAGES = ['new', 'contacted', 'site_visit_scheduled', 'negotiation'];

// Lead stages a visit status change must never regress (a sale may already be
// pending verification, or the lead was deliberately closed/lost by an admin).
const UNRECOVERABLE_LEAD_STAGES = ['pending_sale_verification', 'closed', 'lost'];

// Statuses accepted by PATCH /api/visits/:id
const VISIT_STATUSES = ['pending_agent_review', 'confirmed', 'rejected', 'completed', 'cancelled'];

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
  const { property, requestedSlot, buyerNotes, leadId, inquiryId, visitType = 'property' } = req.body;

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

  // Link the visit onto the buyer's pipeline lead so the request shows up on
  // the lead's timeline. Resolution order:
  //   1. explicit `leadId`
  //   2. the lead converted from a linked inquiry (`inquiryId` -> ContactForm)
  //   3. the buyer's most recent ACTIVE lead for the same property
  // Closed/lost leads are never resurrected, another visit's link is never
  // stolen, and the lead's stage is NOT changed here - it moves to
  // `site_visit_scheduled` when the team accepts the visit (see updateVisit).
  let linkedLead = null;
  if (leadId) {
    linkedLead = await Lead.findById(leadId);
  } else if (inquiryId) {
    const inquiryDoc = await ContactForm.findById(inquiryId).select('convertedLead');
    if (inquiryDoc && inquiryDoc.convertedLead) {
      linkedLead = await Lead.findById(inquiryDoc.convertedLead);
    }
  }
  if (!linkedLead && property) {
    linkedLead = await Lead.findOne({
      user: req.user._id,
      property,
      stage: { $in: ACTIVE_LEAD_STAGES },
    }).sort({ lastActivity: -1 });
  }
  if (linkedLead && !['closed', 'lost'].includes(linkedLead.stage)) {
    if (!linkedLead.visit) linkedLead.visit = visit._id;
    visit.convertedLead = linkedLead._id;
    linkedLead.recordActivity({
      type: 'updated',
      message: `${visitType === 'office' ? 'Office visit' : 'Site visit'} requested for ${slotDate.toLocaleString()} - awaiting confirmation`,
      by: req.user._id,
      byName: req.user.name,
    });
    await Promise.all([linkedLead.save(), visit.save()]);
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

  const VISIT_POPULATE = [
    { path: 'property', select: 'title slug media.coverImage address district' },
    { path: 'requestedBy', select: 'name email phone' },
    { path: 'assignedAgent', select: 'name email' },
    { path: 'convertedLead', select: 'name stage' },
  ];

  let visits;
  if (status) {
    // Single-status view: plain chronological DB pagination is fine.
    visits = await Visit.find(query)
      .populate(VISIT_POPULATE)
      .sort({ requestedSlot: 1 })
      .skip(startIndex)
      .limit(limitNum);
  } else {
    // Mixed view: prioritize the queue (pending reviews first) before
    // pagination, which requires seeing the full result set.
    const all = await Visit.find(query)
      .populate(VISIT_POPULATE)
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
    .populate('assignedAgent', 'name email phone')
    .populate('convertedLead', 'name stage');

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

  if (status && !VISIT_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid visit status: ${status}` });
  }

  let newSlotDate = null;
  if (requestedSlot) {
    newSlotDate = new Date(requestedSlot);
    if (isNaN(newSlotDate.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid requested slot date' });
    }
  }

  const previousStatus = visit.status;
  const previousSlot = visit.requestedSlot;

  if (status) visit.status = status;
  if (internalNotes !== undefined) visit.internalNotes = internalNotes;
  if (assignedAgent !== undefined) visit.assignedAgent = assignedAgent;
  if (requestedSlot) visit.requestedSlot = newSlotDate;

  await visit.save();

  const statusChanged = Boolean(status && status !== previousStatus);
  const slotChanged = Boolean(requestedSlot) && new Date(previousSlot).getTime() !== newSlotDate.getTime();

  // ACCEPTED VISITS BECOME LEADS AUTOMATICALLY. When the team confirms (or
  // completes) a visit, ensure the buyer is represented in the pipeline:
  // creates a lead (property_visit / office_visit source, stage
  // `site_visit_scheduled`) or links onto the buyer's existing active lead,
  // seeds the unified conversation thread and notifies the assigned agent.
  // Conversion must never block the status update, so failures are logged and
  // swallowed here.
  if (statusChanged && (status === 'confirmed' || status === 'completed')) {
    try {
      await ensureLeadFromVisit({ visit, actor: req.user });
    } catch (err) {
      console.error(`Auto lead conversion failed for visit ${visit._id}:`, err.message);
    }
  }

  // Sync stage on the linked Lead if status changes
  if (statusChanged) {
    const linkedLead = visit.convertedLead
      ? await Lead.findById(visit.convertedLead)
      : await Lead.findOne({ visit: visit._id });
    if (linkedLead) {
      const newStage = stageForVisitStatus(status);
      if (
        newStage &&
        newStage !== linkedLead.stage &&
        !UNRECOVERABLE_LEAD_STAGES.includes(linkedLead.stage)
      ) {
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
if (statusChanged) {
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

  // Tell the buyer when the team moves the slot - a buyer must never discover
  // a reschedule by showing up at the wrong time.
  if (slotChanged && !statusChanged) {
    const isOfficeVisit = visit.visitType === 'office';
    const visitLabel = isOfficeVisit ? 'office consultation' : 'site visit';
    const propertyTitle = visit.property?.title;
    const targetLabel = propertyTitle ? `"${propertyTitle}"` : 'your office consultation';

    await notify({
      recipient: visit.requestedBy,
      type: 'visit_rescheduled',
      title: isOfficeVisit ? 'Office Consultation Rescheduled' : 'Site Visit Rescheduled',
      message: `Your ${visitLabel} ${propertyTitle ? `for ${targetLabel} ` : ''}has been rescheduled to ${new Date(visit.requestedSlot).toLocaleString()}.`,
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
 * @desc    Convert a visit request into a pipeline Lead (manual, one-click)
 * @route   POST /api/visits/:id/convert-to-lead
 * @access  Private (admin only)
 *
 * Delegates to the shared ensureLeadFromVisit service - the exact same path
 * used when a visit is accepted automatically - so manual conversion gets the
 * same smart de-duplication, unified conversation threading, agent
 * notification and visit<->lead cross-linking. Accepts the same overrides as
 * the automatic flow (category / priority / assignedAgent / notes / stage).
 */
const convertVisitToLead = asyncHandler(async (req, res) => {
  const { category, priority, assignedAgent, notes, stage } = req.body;

  const visit = await Visit.findById(req.params.id);
  if (!visit) {
    return res.status(404).json({ success: false, message: 'Visit request not found' });
  }

  // Keep the historical 404 contract for unknown agents (the shared service
  // would otherwise silently drop the reference).
  const agentId = assignedAgent || visit.assignedAgent || null;
  if (agentId) {
    const agentDoc = await User.findById(agentId).select('_id');
    if (!agentDoc) {
      return res.status(404).json({ success: false, message: 'Assigned agent not found' });
    }
  }

  const { lead, created, deduped } = await ensureLeadFromVisit({
    visit,
    actor: req.user,
    overrides: {
      category,
      priority,
      assignedAgent: agentId || undefined,
      notes,
      stage,
      _manual: true,
    },
  });

  await lead.populate([
    { path: 'assignedAgent', select: 'name email' },
    { path: 'property', select: 'title' },
    { path: 'visit', select: 'visitType requestedSlot status' },
    { path: 'user', select: 'name email' },
  ]);

  res.status(created ? 201 : 200).json({
    success: true,
    message: deduped
      ? 'This visit was already linked to a lead - returning it'
      : 'Visit converted to lead',
    lead,
    deduped,
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
