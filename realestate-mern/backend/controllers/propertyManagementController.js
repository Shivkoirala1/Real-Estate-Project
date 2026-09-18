const mongoose = require('mongoose');
const PropertyManagementRequest = require('../models/PropertyManagementRequest');
const ManagementService = require('../models/ManagementService');
const { seedDefaultsIfEmpty } = require('./managementServiceController');
const Property = require('../models/Property');
const { PropertyType } = require('../models/Category');
const { validatePropertyInput } = require('../utils/validateProperty');
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
// (terminal declined/terminated do not block a fresh filing)
const LIVE_STATUSES = ['pending', 'active', 'termination_pending'];

const managementSortMap = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  status: { status: 1, createdAt: -1 },
};

// Shared populate for every list/detail response in this module
const REQUEST_POPULATE = [
  { path: 'property', select: 'title slug price status media.coverImage' },
  { path: 'owner', select: 'name email phone' },
];

// Build the mongo filter from query params. Returns { query } on success or
// { invalid: true, message } when a filter value is not usable.
const buildManagementQuery = ({ status, service, owner, from, to }) => {
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
    query.services = service;
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

// Admin or the owner who filed the request. No agent role exists in this
// workflow - agent assignment was removed from the revised lifecycle.
const canAccessManagementRequest = (request, user) =>
  user.role === 'admin' ||
  String(request.owner) === String(user._id);

/**
 * @desc    Owner (or admin on their behalf) requests ongoing management for a property
 * @route   POST /api/property-management
 * @access  Private (verified users; admin can file for any property)
 */
const createManagementRequest = asyncHandler(async (req, res) => {
  const { property: propertyId, services, note } = req.body;

  if (!propertyId) {
    return res.status(400).json({ success: false, message: 'Property id is required' });
  }
  if (!Array.isArray(services) || services.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'services must be a non-empty array of service names',
    });
  }
  // Service names must be currently-active catalogue entries. Historical
  // requests keep their snapshot even if a service is later deactivated.
  // (Seed-on-first-use: a fresh DB validates against the defaults.)
  await seedDefaultsIfEmpty();
  const wanted = services.map((s) => String(s).trim());
  const active = await ManagementService.find({ isActive: true }).select('name').lean();
  const activeNames = new Set(active.map((s) => s.name));
  const unknown = wanted.filter((s) => !activeNames.has(s));
  if (unknown.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Unknown or inactive services: ${unknown.join(', ')}`,
    });
  }
  if (note && String(note).length > 2000) {
    return res
      .status(400)
      .json({ success: false, message: 'note cannot exceed 2000 characters' });
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
    status: 'pending',
    services: wanted,
    note: note || '',
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
  const { status, service, owner, from, to, search, sort, page = 1, limit = 10 } =
    req.query;

  const { query, invalid, message } = buildManagementQuery({
    status,
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
 * @desc    Get a single management request with full context
 * @route   GET /api/property-management/:id
 * @access  Private (admin or the property owner)
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
  await request.populate([...REQUEST_POPULATE, { path: 'decidedBy', select: 'name' }]);

  res.json({ success: true, request });
});

/**
 * @desc    Admin accepts a pending management request (terminal, irreversible).
 *          pending -> active, stamped with decider identity. No reason required.
 * @route   PATCH /api/property-management/:id/accept
 * @access  Private (admin)
 */
const acceptRequest = asyncHandler(async (req, res) => {
  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }
  if (request.status !== 'pending') {
    return res
      .status(409)
      .json({ success: false, message: `Only a pending request can be accepted (current status: ${request.status}). This decision cannot be undone.` });
  }

  await runWithTransaction(async (session) => {
    request.status = 'active';
    request.decidedBy = req.user._id;
    request.decidedAt = new Date();
    request.recordActivity({
      type: 'accepted',
      message: 'Request accepted - management is now active',
      by: req.user._id,
      byName: req.user.name,
    });
    await request.save(opts(session));
  });

  // Notifications run after the transaction so they can never be rolled back
  // or duplicated by a transaction retry.
  await notify({
    recipient: request.owner,
    type: 'management_request_accepted',
    title: 'Management request accepted',
    message: 'Your property management request has been accepted. Management is now active.',
    propertyManagementRequest: request._id,
    property: request.property,
    link: `/my-properties/management/${request._id}`,
  });

  await request.populate(REQUEST_POPULATE);

  res.json({ success: true, request });
});

/**
 * @desc    Admin declines a pending management request (terminal, irreversible).
 *          pending -> declined. A decline reason is required.
 * @route   PATCH /api/property-management/:id/decline
 * @access  Private (admin)
 */
const declineRequest = asyncHandler(async (req, res) => {
  const { decisionReason } = req.body;
  if (!decisionReason || !String(decisionReason).trim()) {
    return res.status(400).json({ success: false, message: 'A decline reason is required' });
  }
  const trimmedReason = String(decisionReason).trim();

  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }
  if (request.status !== 'pending') {
    return res
      .status(409)
      .json({ success: false, message: `Only a pending request can be declined (current status: ${request.status}). This decision cannot be undone.` });
  }

  await runWithTransaction(async (session) => {
    request.status = 'declined';
    request.decisionReason = trimmedReason;
    request.decidedBy = req.user._id;
    request.decidedAt = new Date();
    request.recordActivity({
      type: 'declined',
      message: `Request declined: ${trimmedReason}`,
      by: req.user._id,
      byName: req.user.name,
    });
    await request.save(opts(session));
  });

  await notify({
    recipient: request.owner,
    type: 'management_request_declined',
    title: 'Management request declined',
    message: `Your property management request was declined. Reason: ${trimmedReason}`,
    propertyManagementRequest: request._id,
    property: request.property,
    link: `/my-properties/management/${request._id}`,
  });

  await request.populate(REQUEST_POPULATE);

  res.json({ success: true, request });
});

/**
 * @desc    Admin terminates an active management engagement directly.
 *          active -> terminated ONLY. A request in termination_pending must
 *          go through approve-termination instead (direct termination there
 *          is forbidden to avoid two paths to the same outcome).
 *          Reason required, stored as terminatedReason.
 * @route   PATCH /api/property-management/:id/terminate
 * @access  Private (admin)
 */
const terminateManagement = asyncHandler(async (req, res) => {
  const { terminatedReason } = req.body;
  if (!terminatedReason || !String(terminatedReason).trim()) {
    return res.status(400).json({ success: false, message: 'A termination reason is required' });
  }
  const trimmedReason = String(terminatedReason).trim();

  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }
  if (request.status !== 'active') {
    return res.status(409).json({
      success: false,
      message: `Only an active request can be terminated directly (current status: ${request.status}). Requests pending termination must use approve-termination.`,
    });
  }

  const property = await Property.findById(request.property).select('title');
  const propertyTitle = property ? property.title : 'your property';

  await runWithTransaction(async (session) => {
    request.status = 'terminated';
    request.terminatedReason = trimmedReason;
    request.terminatedBy = req.user._id;
    request.terminatedAt = new Date();
    request.recordActivity({
      type: 'terminated',
      message: `Management terminated: ${trimmedReason}`,
      by: req.user._id,
      byName: req.user.name,
    });
    await request.save(opts(session));
  });

  await notify({
    recipient: request.owner,
    type: 'management_terminated',
    title: 'Management terminated',
    message: `Management for "${propertyTitle}" has been terminated.`,
    propertyManagementRequest: request._id,
    property: request.property,
    link: `/my-properties/management/${request._id}`,
  });

  await request.populate(REQUEST_POPULATE);

  res.json({ success: true, request });
});

/**
 * @desc    Admin approves an owner-requested termination.
 *          termination_pending -> terminated ONLY.
 * @route   PATCH /api/property-management/:id/approve-termination
 * @access  Private (admin)
 */
const approveTermination = asyncHandler(async (req, res) => {
  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }
  if (request.status !== 'termination_pending') {
    return res.status(409).json({
      success: false,
      message: `Only a request pending termination can be approved (current status: ${request.status}).`,
    });
  }

  const property = await Property.findById(request.property).select('title');
  const propertyTitle = property ? property.title : 'your property';

  await runWithTransaction(async (session) => {
    request.status = 'terminated';
    request.terminatedBy = req.user._id;
    request.terminatedAt = new Date();
    request.recordActivity({
      type: 'terminated',
      message: 'Owner-requested termination approved - management terminated',
      by: req.user._id,
      byName: req.user.name,
    });
    await request.save(opts(session));
  });

  // Single notification type for both termination paths (mirrors the single
  // `terminated` activity type).
  await notify({
    recipient: request.owner,
    type: 'management_terminated',
    title: 'Management terminated',
    message: `Management for "${propertyTitle}" has been terminated.`,
    propertyManagementRequest: request._id,
    property: request.property,
    link: `/my-properties/management/${request._id}`,
  });

  await request.populate(REQUEST_POPULATE);

  res.json({ success: true, request });
});

/**
 * @desc    Property owner requests termination of an ACTIVE management.
 *          active -> termination_pending. Reason optional. Once submitted
 *          the owner cannot reverse it - only an admin resolves it.
 * @route   PATCH /api/property-management/:id/request-termination
 * @access  Private (the property owner only - admins use /terminate or
 *          /approve-termination instead)
 */
const requestTermination = asyncHandler(async (req, res) => {
  const { terminationReason } = req.body;
  const trimmedReason = terminationReason ? String(terminationReason).trim() : '';

  const request = await PropertyManagementRequest.findById(req.params.id);
  if (!request) {
    return res.status(404).json({ success: false, message: 'Management request not found' });
  }
  if (String(request.owner) !== String(req.user._id)) {
    return res
      .status(403)
      .json({ success: false, message: 'Only the property owner can request termination' });
  }
  if (request.status !== 'active') {
    return res.status(409).json({
      success: false,
      message: `Termination can only be requested while management is active (current status: ${request.status}).`,
    });
  }

  const property = await Property.findById(request.property).select('title');
  const propertyTitle = property ? property.title : 'a property';

  await runWithTransaction(async (session) => {
    request.status = 'termination_pending';
    request.terminationReason = trimmedReason;
    request.terminationRequestedAt = new Date();
    request.recordActivity({
      type: 'termination_requested',
      message: trimmedReason
        ? `Termination requested by owner: ${trimmedReason}`
        : 'Termination requested by owner',
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
 * @access  Private (admin or the property owner)
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
 * @access  Private (admin or the property owner)
 */
const getActivities = asyncHandler(async (req, res) => {
  const request = await PropertyManagementRequest.findById(req.params.id).select(
    'owner activities'
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

/**
 * @desc    One-step owner wizard: create a management-purpose property AND
 *          file its management request atomically. Either both writes land
 *          or neither does (transaction; sequential fallback validates fully
 *          up front so a late failure cannot orphan a property either).
 * @route   POST /api/property-management/with-property
 * @access  Private (verified users)
 */
const createWithProperty = asyncHandler(async (req, res) => {
  const { property: propertyInput, services, note } = req.body;
  const body = { ...(propertyInput || {}), saleType: 'management', listedBy: req.user._id };

  if (!Array.isArray(services) || services.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'services must be a non-empty array of service names',
    });
  }
  const wanted = services.map((s) => String(s).trim());
  await seedDefaultsIfEmpty();
  const active = await ManagementService.find({ isActive: true }).select('name').lean();
  const activeNames = new Set(active.map((s) => s.name));
  const unknown = wanted.filter((s) => !activeNames.has(s));
  if (unknown.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Unknown or inactive services: ${unknown.join(', ')}`,
    });
  }

  const propertyTypeDoc = body.propertyType
    ? await PropertyType.findById(body.propertyType).select('category')
    : null;
  const category = propertyTypeDoc?.category || 'building';
  const validationErrors = validatePropertyInput(body, category, 'management');
  if (validationErrors.length > 0) {
    return res.status(400).json({ success: false, message: validationErrors[0], errors: validationErrors });
  }

  let created;
  try {
    created = await runWithTransaction(async (session) => {
      const [property] = await Property.create(
        [{ ...body, price: body.price ?? null, currency: 'NPR' }],
        opts(session)
      );
      // One live request per property - enforced here (pre-write) and by the
      // partial unique index (race safety), same as the standalone endpoint.
      const dupQuery = PropertyManagementRequest.findOne({
        property: property._id,
        status: { $in: LIVE_STATUSES },
      });
      if (session) dupQuery.session(session);
      const existing = await dupQuery;
      if (existing) {
        const err = new Error('DUPLICATE_LIVE_REQUEST');
        err.statusCode = 409;
        throw err;
      }
      const [request] = await PropertyManagementRequest.create(
        [
          {
            property: property._id,
            owner: req.user._id,
            status: 'pending',
            services: wanted,
            note: note || '',
          },
        ],
        opts(session)
      );
      request.recordActivity({
        type: 'submitted',
        message: 'Management request submitted with property registration',
        by: req.user._id,
        byName: req.user.name,
      });
      await request.save(opts(session));
      return { property, request };
    });
  } catch (err) {
    if (err && (err.message === 'DUPLICATE_LIVE_REQUEST' || err.code === 11000)) {
      return res
        .status(409)
        .json({ success: false, message: 'This property already has an active management request' });
    }
    throw err;
  }

  await created.request.populate(REQUEST_POPULATE);

  const admins = await User.find({ role: 'admin' }).select('_id');
  await notifyMany(
    admins.map((a) => a._id),
    {
      type: 'management_request_submitted',
      title: 'New management request',
      message: `${req.user.name} registered "${created.property.title}" for management.`,
      propertyManagementRequest: created.request._id,
      property: created.property._id,
      link: '/dashboard/admin/property-management',
    }
  );

  res.status(201).json({ success: true, property: created.property, request: created.request });
});

module.exports = {
  createManagementRequest,
  createWithProperty,
  getMyManagementRequests,
  getManagementRequests,
  getManagementRequestById,
  acceptRequest,
  declineRequest,
  terminateManagement,
  approveTermination,
  requestTermination,
  addActivity,
  getActivities,
};
