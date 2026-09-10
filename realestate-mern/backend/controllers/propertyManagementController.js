const mongoose = require('mongoose');
const PropertyManagementRequest = require('../models/PropertyManagementRequest');
const Property = require('../models/Property');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyMany } = require('../utils/notify');
const { runWithTransaction, opts } = require('../utils/withTransaction');

// ---------- helpers ----------

// Parse a query/body date string (ISO or yyyy-mm-dd), returning null when it
// cannot be understood
const parseDateParam = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Statuses that block a property from receiving another management request
const LIVE_STATUSES = ['pending_review', 'approved', 'active'];

const managementSortMap = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  status: { status: 1, createdAt: -1 },
};

// Shared populate for every list/detail response in this module
const REQUEST_POPULATE = [
  { path: 'property', select: 'title slug price status media.coverImage' },
  { path: 'owner', select: 'name email phone' },
  { path: 'assignedAgent', select: 'name email' },
];

// Build the mongo filter from query params. Returns { query } on success or
// { invalid: true, message } when a filter value is not usable.
const buildManagementQuery = ({ status, assignedAgent, service, owner, from, to }) => {
  const query = {};

  if (status) {
    if (!PropertyManagementRequest.STATUSES.includes(status)) {
      return {
        invalid: true,
        message: `Invalid status. Must be one of: ${PropertyManagementRequest.STATUSES.join(', ')}`,
      };
    }
    query.status = status;
  }
  if (service) {
    if (!PropertyManagementRequest.SERVICES.includes(service)) {
      return {
        invalid: true,
        message: `Invalid service. Must be one of: ${PropertyManagementRequest.SERVICES.join(', ')}`,
      };
    }
    query.services = service;
  }
  if (assignedAgent === 'unassigned') {
    query.assignedAgent = null;
  } else if (assignedAgent) {
    if (!mongoose.Types.ObjectId.isValid(assignedAgent)) {
      return { invalid: true, message: 'Invalid assigned agent filter' };
    }
    // Cast up front so both the find and the counts aggregate can use it
    query.assignedAgent = new mongoose.Types.ObjectId(assignedAgent);
  }
  if (owner) {
    if (!mongoose.Types.ObjectId.isValid(owner)) {
      return { invalid: true, message: 'Invalid owner filter' };
    }
    query.owner = new mongoose.Types.ObjectId(owner);
  }
  if (from || to) {
    const fromDate = parseDateParam(from);
    const toDate = parseDateParam(to);
    if (from && !fromDate) {
      return { invalid: true, message: 'Invalid "from" date' };
    }
    if (to && !toDate) {
      return { invalid: true, message: 'Invalid "to" date' };
    }
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = fromDate;
    if (toDate) query.createdAt.$lte = toDate;
  }

  return { query };
};

// Admin, the owner who filed the request, or the currently assigned agent
const canAccessManagementRequest = (request, user) =>
  user.role === 'admin' ||
  String(request.owner) === String(user._id) ||
  (request.assignedAgent && String(request.assignedAgent) === String(user._id));

/**
 * @desc    Owner (or admin on their behalf) requests ongoing management for a property
 * @route   POST /api/property-management
 * @access  Private (verified users; admin can file for any property)
 */
const createManagementRequest = asyncHandler(async (req, res) => {
  const { property: propertyId, services, preferredStartDate, ownerNotes } = req.body;

  if (!propertyId) {
    return res.status(400).json({ success: false, message: 'Property id is required' });
  }
  if (
    !Array.isArray(services) ||
    services.length === 0 ||
    !services.every((s) => PropertyManagementRequest.SERVICES.includes(s))
  ) {
    return res.status(400).json({
      success: false,
      message: `services must be a non-empty array chosen from: ${PropertyManagementRequest.SERVICES.join(', ')}`,
    });
  }
  let startDate = null;
  if (preferredStartDate) {
    startDate = parseDateParam(preferredStartDate);
    if (!startDate) {
      return res.status(400).json({ success: false, message: 'Invalid "preferredStartDate" date' });
    }
  }
  if (ownerNotes && String(ownerNotes).length > 2000) {
    return res
      .status(400)
      .json({ success: false, message: 'ownerNotes cannot exceed 2000 characters' });
  }

  const property = await Property.findById(propertyId);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  // Admins may file on behalf of the listing owner; otherwise only the owner
  let ownerId;
  if (req.user.role === 'admin') {
    if (!property.listedBy) {
      return res
        .status(400)
        .json({ success: false, message: 'This property has no listed owner to request management for' });
    }
    ownerId = property.listedBy;
  } else if (property.listedBy && String(property.listedBy) === String(req.user._id)) {
    ownerId = req.user._id;
  } else {
    return res
      .status(403)
      .json({ success: false, message: 'You can only request management for your own property' });
  }

  // One live (non-terminal) request per property at a time
  const existing = await PropertyManagementRequest.findOne({
    property: property._id,
    status: { $in: LIVE_STATUSES },
  });
  if (existing) {
    return res
      .status(409)
      .json({ success: false, message: 'This property already has an active management request' });
  }

  const request = new PropertyManagementRequest({
    property: property._id,
    // Denormalized from Property.listedBy for flat reporting queries
    owner: ownerId,
    status: 'pending_review',
    services,
    preferredStartDate: startDate,
    ownerNotes: ownerNotes || '',
  });
  request.recordActivity({
    type: 'submitted',
    message: 'Management request submitted',
    by: req.user._id,
    byName: req.user.name,
  });

  try {
    await runWithTransaction(async (session) => {
      await request.save(opts(session));
    });
  } catch (err) {
    // The partial unique index guarantees one live request per property -
    // map a race-condition duplicate key to a friendly conflict response
    if (err && err.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: 'This property already has an active management request' });
    }
    throw err;
  }

  await request.populate(REQUEST_POPULATE);

  // Alert every admin - the management review queue is their inbox
  const admins = await User.find({ role: 'admin' }).select('_id');
  const ownerName = (request.owner && request.owner.name) || 'A property owner';
  await notifyMany(
    admins.map((a) => a._id),
    {
      type: 'management_request_submitted',
      title: 'New management request',
      message: `${ownerName} requested management for "${property.title}".`,
      propertyManagementRequest: request._id,
      property: property._id,
      link: '/dashboard/admin/property-management',
    }
  );

  res.status(201).json({ success: true, request });
});

/**
 * @desc    List the signed-in owner's management requests
 * @route   GET /api/property-management/my-requests
 * @access  Private
 */
const getMyManagementRequests = asyncHandler(async (req, res) => {
  const { status, sort, page = 1, limit = 10 } = req.query;

  const { query, invalid, message } = buildManagementQuery({ status });
  if (invalid) {
    return res.status(400).json({ success: false, message });
  }
  // Forced scoping before the DB query - a user only ever sees their own requests
  query.owner = req.user._id;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 1), 100); // hard cap 100
  const skip = (pageNum - 1) * limitNum;

  const [requests, total] = await Promise.all([
    PropertyManagementRequest.find(query)
      .populate(REQUEST_POPULATE)
      .sort(managementSortMap[sort] || managementSortMap.newest)
      .skip(skip)
      .limit(limitNum),
    PropertyManagementRequest.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: requests.length,
    requests,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * @desc    Admin lists every management request with filters, search + status counters
 * @route   GET /api/property-management
 * @access  Private (admin)
 */
const getManagementRequests = asyncHandler(async (req, res) => {
  const { status, assignedAgent, service, owner, from, to, search, sort, page = 1, limit = 10 } =
    req.query;

  const { query, invalid, message } = buildManagementQuery({
    status,
    assignedAgent,
    service,
    owner,
    from,
    to,
  });
  if (invalid) {
    return res.status(400).json({ success: false, message });
  }

  // Search matches Property.title or User.name - resolve both up front so the
  // main query stays a simple indexed find
  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    const [matchingProperties, matchingUsers] = await Promise.all([
      Property.find({ title: searchRegex }).select('_id'),
      User.find({ name: searchRegex }).select('_id'),
    ]);
    query.$or = [
      { property: { $in: matchingProperties.map((p) => p._id) } },
      { owner: { $in: matchingUsers.map((u) => u._id) } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 1), 100); // hard cap 100
  const skip = (pageNum - 1) * limitNum;

  // Status tab counters use the same filters minus the status itself
  const baseFilter = { ...query };
  delete baseFilter.status;

  const [requests, total, statusCounts] = await Promise.all([
    PropertyManagementRequest.find(query)
      .populate(REQUEST_POPULATE)
      .sort(managementSortMap[sort] || managementSortMap.newest)
      .skip(skip)
      .limit(limitNum),
    PropertyManagementRequest.countDocuments(query),
    PropertyManagementRequest.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const countsByStatus = {};
  PropertyManagementRequest.STATUSES.forEach((s) => {
    countsByStatus[s] = 0;
  });
  statusCounts.forEach(({ _id, count }) => {
    countsByStatus[_id] = count;
  });

  res.json({
    success: true,
    count: requests.length,
    requests,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
    countsByStatus,
  });
});

/**
 * @desc    List management requests assigned to the signed-in agent
 * @route   GET /api/property-management/assigned
 * @access  Private (agent/admin)
 */
const getAssignedProperties = asyncHandler(async (req, res) => {
  const { status, search, sort, page = 1, limit = 10 } = req.query;

  const { query, invalid, message } = buildManagementQuery({ status });
  if (invalid) {
    return res.status(400).json({ success: false, message });
  }
  // Forced scoping before the DB query - only the caller's own assignments
  query.assignedAgent = req.user._id;

  // Search matches the property title only
  if (search) {
    const matchingProperties = await Property.find({
      title: { $regex: search, $options: 'i' },
    }).select('_id');
    query.property = { $in: matchingProperties.map((p) => p._id) };
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 1), 100); // hard cap 100
  const skip = (pageNum - 1) * limitNum;

  const [requests, total] = await Promise.all([
    PropertyManagementRequest.find(query)
      .populate(REQUEST_POPULATE)
      .sort(managementSortMap[sort] || managementSortMap.newest)
      .skip(skip)
      .limit(limitNum),
    PropertyManagementRequest.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: requests.length,
    requests,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * @desc    Get a single management request with full context
 * @route   GET /api/property-management/:id
 * @access  Private (admin, the property owner, or the assigned agent)
 */
const getManagementRequestById = asyncHandler(async (req, res) => {
  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }

  if (!canAccessManagementRequest(request, req.user)) {
    return res
      .status(403)
      .json({ success: false, message: 'You are not authorized to view this management request' });
  }

  // Re-populate in full now that access is confirmed
  await request.populate([...REQUEST_POPULATE, { path: 'reviewedBy', select: 'name' }]);

  res.json({ success: true, request });
});

/**
 * @desc    Admin approves a pending management request
 * @route   PATCH /api/property-management/:id/approve
 * @access  Private (admin)
 */
const approveRequest = asyncHandler(async (req, res) => {
  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }
  if (request.status !== 'pending_review') {
    return res
      .status(409)
      .json({ success: false, message: 'Only a pending request can be approved' });
  }

  await runWithTransaction(async (session) => {
    request.status = 'approved';
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.recordActivity({
      type: 'approved',
      message: 'Request approved',
      by: req.user._id,
      byName: req.user.name,
    });
    await request.save(opts(session));
  });

  // Notifications run after the transaction so they can never be rolled back
  // or duplicated by a transaction retry.
  await notify({
    recipient: request.owner,
    type: 'management_request_approved',
    title: 'Management request approved',
    message: 'Your property management request has been approved.',
    propertyManagementRequest: request._id,
    property: request.property,
    link: `/my-properties/management/${request._id}`,
  });

  await request.populate(REQUEST_POPULATE);

  res.json({ success: true, request });
});

/**
 * @desc    Admin rejects a pending management request (reason required)
 * @route   PATCH /api/property-management/:id/reject
 * @access  Private (admin)
 */
const rejectRequest = asyncHandler(async (req, res) => {
  const { rejectionReason } = req.body;
  if (!rejectionReason || !String(rejectionReason).trim()) {
    return res.status(400).json({ success: false, message: 'A rejection reason is required' });
  }
  const trimmedReason = String(rejectionReason).trim();

  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }
  if (request.status !== 'pending_review') {
    return res
      .status(409)
      .json({ success: false, message: 'Only a pending request can be rejected' });
  }

  await runWithTransaction(async (session) => {
    request.status = 'rejected';
    request.rejectionReason = trimmedReason;
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.recordActivity({
      type: 'rejected',
      message: `Request rejected: ${trimmedReason}`,
      by: req.user._id,
      byName: req.user.name,
    });
    await request.save(opts(session));
  });

  await notify({
    recipient: request.owner,
    type: 'management_request_rejected',
    title: 'Management request rejected',
    message: `Your property management request was rejected. Reason: ${trimmedReason}`,
    propertyManagementRequest: request._id,
    property: request.property,
    link: `/my-properties/management/${request._id}`,
  });

  await request.populate(REQUEST_POPULATE);

  res.json({ success: true, request });
});

/**
 * @desc    Admin assigns / reassigns / unassigns the managing agent.
 *          Explicitly NOT gated by request status - assignment is independent
 *          of the approval flow and can happen at any time.
 * @route   PATCH /api/property-management/:id/assign-agent
 * @access  Private (admin)
 */
const assignAgent = asyncHandler(async (req, res) => {
  const { agentId } = req.body;

  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }

  // agentId null / empty string -> unassign; otherwise it must resolve to an
  // active agent account
  const hasAgentId = agentId !== undefined && agentId !== null && agentId !== '';
  let agent = null;
  if (hasAgentId) {
    if (!mongoose.Types.ObjectId.isValid(agentId)) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    agent = await User.findById(agentId);
    if (!agent) {
      return res.status(404).json({ success: false, message: 'Agent not found' });
    }
    if (agent.role !== 'agent' || agent.isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'The selected user must be an active agent account',
      });
    }
  }

  const previousAgentId = request.assignedAgent ? String(request.assignedAgent) : null;
  if (hasAgentId && previousAgentId && previousAgentId === String(agent._id)) {
    return res.status(400).json({ success: false, message: 'This agent is already assigned' });
  }
  if (!hasAgentId && !previousAgentId) {
    return res
      .status(400)
      .json({ success: false, message: 'No agent is currently assigned to this request' });
  }

  // Needed for the audit-trail message
  const previousAgent = previousAgentId
    ? await User.findById(request.assignedAgent).select('name')
    : null;
  const prevName = previousAgent ? previousAgent.name : 'Unknown agent';

  await runWithTransaction(async (session) => {
    request.assignedAgent = agent ? agent._id : null;
    if (agent) {
      request.recordActivity({
        type: previousAgentId ? 'agent_reassigned' : 'agent_assigned',
        message: previousAgentId
          ? `Agent reassigned from ${prevName} to ${agent.name}`
          : `${agent.name} assigned as managing agent`,
        by: req.user._id,
        byName: req.user.name,
      });
    } else {
      request.recordActivity({
        type: 'agent_reassigned',
        message: `Agent ${prevName} unassigned`,
        by: req.user._id,
        byName: req.user.name,
      });
    }
    await request.save(opts(session));
  });

  // Notifications run after the transaction so they can never be rolled back
  // or duplicated by a transaction retry.
  if (agent) {
    const property = await Property.findById(request.property).select('title');
    await notify({
      recipient: agent._id,
      type: 'management_agent_assigned',
      title: 'New property assigned to you',
      message: `You have been assigned to manage "${property ? property.title : 'a property'}".`,
      propertyManagementRequest: request._id,
      property: request.property,
      link: `/dashboard/agent/properties/managed/${request._id}`,
    });
  }

  await request.populate(REQUEST_POPULATE);

  res.json({ success: true, request });
});

/**
 * @desc    Start an approved management (approved -> active); admins always,
 *          agents only on requests assigned to them
 * @route   PATCH /api/property-management/:id/status
 * @access  Private (admin or assigned agent)
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }

  // The only transition this endpoint performs: approved -> active
  if (status !== 'active' || request.status !== 'approved') {
    return res
      .status(409)
      .json({ success: false, message: 'Only an approved request can be started' });
  }

  // Agents may only start management on requests assigned to them
  const isAssignedAgent =
    request.assignedAgent && String(request.assignedAgent) === String(req.user._id);
  if (req.user.role !== 'admin' && !isAssignedAgent) {
    return res.status(403).json({
      success: false,
      message: 'Only the assigned agent or an admin can start this management',
    });
  }

  const property = await Property.findById(request.property).select('title');

  await runWithTransaction(async (session) => {
    request.status = 'active';
    request.startedAt = new Date();
    request.recordActivity({
      type: 'status_changed',
      message: 'Management started',
      by: req.user._id,
      byName: req.user.name,
    });
    await request.save(opts(session));
  });

  await notify({
    recipient: request.owner,
    type: 'management_status_changed',
    title: 'Management started',
    message: `Management for "${property ? property.title : 'your property'}" is now active.`,
    propertyManagementRequest: request._id,
    property: request.property,
    link: `/my-properties/management/${request._id}`,
  });

  await request.populate(REQUEST_POPULATE);

  res.json({ success: true, request });
});

/**
 * @desc    Admin terminates an approved/active management engagement
 * @route   PATCH /api/property-management/:id/terminate
 * @access  Private (admin)
 */
const terminateManagement = asyncHandler(async (req, res) => {
  const { terminationReason } = req.body;
  if (!terminationReason || !String(terminationReason).trim()) {
    return res.status(400).json({ success: false, message: 'A termination reason is required' });
  }
  const trimmedReason = String(terminationReason).trim();

  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }
  if (request.status !== 'approved' && request.status !== 'active') {
    return res.status(409).json({
      success: false,
      message: `Only approved or active requests can be terminated (current status: ${request.status}).`,
    });
  }

  const property = await Property.findById(request.property).select('title');
  const propertyTitle = property ? property.title : 'your property';

  await runWithTransaction(async (session) => {
    request.status = 'terminated';
    request.terminatedAt = new Date();
    request.terminationReason = trimmedReason;
    request.recordActivity({
      type: 'terminated',
      message: `Management terminated: ${trimmedReason}`,
      by: req.user._id,
      byName: req.user.name,
    });
    await request.save(opts(session));
  });

  // Notify the owner and (when set) the assigned agent - each with a link
  // pointing at their own corner of the app.
  await notify({
    recipient: request.owner,
    type: 'management_terminated',
    title: 'Management terminated',
    message: `Management for "${propertyTitle}" has been terminated.`,
    propertyManagementRequest: request._id,
    property: request.property,
    link: `/my-properties/management/${request._id}`,
  });
  if (request.assignedAgent) {
    await notify({
      recipient: request.assignedAgent,
      type: 'management_terminated',
      title: 'Management terminated',
      message: `Management for "${propertyTitle}" has been terminated.`,
      propertyManagementRequest: request._id,
      property: request.property,
      link: `/dashboard/agent/properties/managed/${request._id}`,
    });
  }

  await request.populate(REQUEST_POPULATE);

  res.json({ success: true, request });
});

/**
 * @desc    Property owner ASKS to end an approved/active management. The status
 *          stays unchanged - an admin reviews and executes via /terminate
 *          (Open Question #1 resolution: owner requests, admin executes).
 * @route   PATCH /api/property-management/:id/request-termination
 * @access  Private (the property owner only - admins use /terminate instead)
 */
const requestTermination = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'Please provide a reason' });
  }
  const trimmedReason = String(reason).trim();

  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }
  if (String(request.owner) !== String(req.user._id)) {
    return res
      .status(403)
      .json({ success: false, message: 'Only the property owner can request termination' });
  }
  if (request.status !== 'approved' && request.status !== 'active') {
    return res.status(409).json({
      success: false,
      message: `Termination can only be requested while management is approved or active (current status: ${request.status}).`,
    });
  }

  const property = await Property.findById(request.property).select('title');
  const propertyTitle = property ? property.title : 'a property';

  await runWithTransaction(async (session) => {
    request.recordActivity({
      type: 'note_added',
      message: `Termination requested by owner: ${trimmedReason}`,
      by: req.user._id,
      byName: req.user.name,
    });
    await request.save(opts(session));
  });

  // Alert every admin - they execute the actual termination
  const admins = await User.find({ role: 'admin' }).select('_id');
  await notifyMany(
    admins.map((a) => a._id),
    {
      type: 'management_termination_requested',
      title: 'Termination requested',
      message: `${req.user.name} requested to end management for "${propertyTitle}".`,
      propertyManagementRequest: request._id,
      property: request.property,
      link: `/dashboard/admin/property-management/${request._id}`,
    }
  );

  await request.populate(REQUEST_POPULATE);

  res.json({ success: true, request });
});

/**
 * @desc    Add a note to a management request's activity timeline
 * @route   POST /api/property-management/:id/activities
 * @access  Private (admin, the property owner, or the assigned agent)
 */
const addActivity = asyncHandler(async (req, res) => {
  const { message } = req.body;
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  if (!trimmedMessage) {
    return res.status(400).json({ success: false, message: 'An activity message is required' });
  }
  if (trimmedMessage.length > 1000) {
    return res
      .status(400)
      .json({ success: false, message: 'Activity message cannot exceed 1000 characters' });
  }

  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }
  if (!canAccessManagementRequest(request, req.user)) {
    return res.status(403).json({
      success: false,
      message: 'You are not authorized to add notes to this management request',
    });
  }

  await runWithTransaction(async (session) => {
    request.recordActivity({
      type: 'note_added',
      message: trimmedMessage,
      by: req.user._id,
      byName: req.user.name,
    });
    await request.save(opts(session));
  });

  // The just-pushed subdoc is the last element - return it as plain JSON
  const activity = request.activities.length
    ? request.activities[request.activities.length - 1].toObject()
    : null;

  res.status(201).json({ success: true, activity });
});

/**
 * @desc    Paginated activity timeline of a management request (newest first)
 * @route   GET /api/property-management/:id/activities
 * @access  Private (admin, the property owner, or the assigned agent)
 */
const getActivities = asyncHandler(async (req, res) => {
  const request = await PropertyManagementRequest.findById(req.params.id).select(
    'owner assignedAgent activities'
  );
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }
  if (!canAccessManagementRequest(request, req.user)) {
    return res
      .status(403)
      .json({ success: false, message: 'You are not authorized to view this management request' });
  }

  const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 20), 100); // hard cap 100
  const skip = (pageNum - 1) * limitNum;

  const total = request.activities.length;
  // Newest first - map returns a copy, so the stored order is never mutated
  const newestFirst = request.activities.map((activity) => activity.toObject()).reverse();
  const activities = newestFirst.slice(skip, skip + limitNum);

  res.json({
    success: true,
    count: activities.length,
    activities,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

module.exports = {
  createManagementRequest,
  getMyManagementRequests,
  getManagementRequests,
  getAssignedProperties,
  getManagementRequestById,
  approveRequest,
  rejectRequest,
  assignAgent,
  updateStatus,
  terminateManagement,
  requestTermination,
  addActivity,
  getActivities,
};
