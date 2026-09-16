const mongoose = require('mongoose');
const Rental = require('../models/Rental');
const CommissionRecord = require('../models/CommissionRecord');
const Lead = require('../models/Lead');
const Property = require('../models/Property');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyMany } = require('../utils/notify');
const { runWithTransaction, opts } = require('../utils/withTransaction');
const { effectiveCommissionPercentage } = require('../utils/commission');

// ---------- helpers ----------
const rentalSortMap = {
  newest: { submittedAt: -1 },
  oldest: { submittedAt: 1 },
  rent_desc: { monthlyRent: -1 },
  rent_asc: { monthlyRent: 1 },
};

const parseDateParam = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * @desc    Agent files a rental deal on a lead -> admin verification queue
 * @route   POST /api/rentals
 * @access  Private (admin or assigned agent)
 */
const createRental = asyncHandler(async (req, res) => {
  const {
    leadId,
    monthlyRent,
    durationInMonths,
    startDate,
    securityDeposit,
    paymentFrequency,
    advanceMonths,
    remarks,
  } = req.body;
  const tenant = req.body.tenant || {};

  if (!leadId) {
    return res.status(400).json({ success: false, message: 'leadId is required to file a rental' });
  }

  const lead = await Lead.findById(leadId);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }

  const isAuthorized =
    req.user.role === 'admin' ||
    (lead.assignedAgent && String(lead.assignedAgent) === String(req.user._id));
  if (!isAuthorized) {
    return res.status(403).json({
      success: false,
      message: 'Only the assigned agent can submit a rental for this lead',
    });
  }

  if (!lead.property) {
    return res.status(400).json({
      success: false,
      message: 'This lead has no linked property. Add the property to the lead first.',
    });
  }

  // Lead stage guards — same pattern as Sale, dedicated stage name
  if (lead.stage === 'pending_rental_verification') {
    return res.status(409).json({
      success: false,
      message: 'A rental has already been submitted for this lead and is awaiting verification.',
    });
  }
  if (lead.stage === 'closed' || lead.stage === 'lost') {
    return res
      .status(400)
      .json({ success: false, message: 'A rental cannot be filed on a closed or lost lead.' });
  }

  // --- Validation (rent-shaped) ---
  if (!tenant.name || !String(tenant.name).trim()) {
    return res.status(400).json({ success: false, message: 'Tenant name is required' });
  }
  if (typeof monthlyRent !== 'number' || !Number.isFinite(monthlyRent) || monthlyRent <= 0) {
    return res
      .status(400)
      .json({ success: false, message: 'Monthly rent must be a number greater than 0' });
  }
  if (!Number.isInteger(durationInMonths) || durationInMonths < 1) {
    return res
      .status(400)
      .json({ success: false, message: 'Lease duration must be a whole number of months (min 1)' });
  }

  // Auto-link tenant account by email (kept for parity with Sale — useful
  // for future tenant dashboards even though rentals have no EMI requirement)
  if (!tenant.user && tenant.email) {
    const registeredTenant = await User.findOne({
      email: String(tenant.email).trim().toLowerCase(),
    }).select('_id name email');
    if (registeredTenant) tenant.user = registeredTenant._id;
  }

  const property = await Property.findById(lead.property);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }

  // 🔑 Rent-specific guard: this flow only applies to rent listings
  if (property.saleType !== 'rent') {
    return res.status(400).json({
      success: false,
      message: 'This property is listed for sale — file a Sale instead of a Rental.',
    });
  }
  if (property.status === 'rented') {
    return res.status(409).json({ success: false, message: 'This property is already rented.' });
  }
  if (property.status === 'reserved') {
    const pendingRental = await Rental.findOne({
      property: property._id,
      status: 'pending_review',
    });
    if (pendingRental) {
      return res
        .status(409)
        .json({ success: false, message: 'This property is already reserved by a pending rental.' });
    }
  }

  const agentId = req.user.role === 'agent' ? req.user._id : lead.assignedAgent || req.user._id;

  const rental = new Rental({
    lead: lead._id,
    property: property._id,
    agent: agentId,
    tenant: {
      name: String(tenant.name).trim(),
      phone: tenant.phone || '',
      email: tenant.email || '',
      user: tenant.user || null,
    },
    monthlyRent,
    durationInMonths,
    startDate: start,
    securityDeposit: securityDeposit ?? 0,
    paymentFrequency,
    advanceMonths: advanceMonths ?? 1,
    remarks: remarks || '',
    status: 'pending_review',
    submittedBy: req.user._id,
    submittedAt: new Date(),
    activities: [
      {
        type: 'submitted',
        message: `Rental filed for "${property.title}" at NPR ${monthlyRent.toLocaleString()}/month × ${durationInMonths} months`,
        by: req.user._id,
        byName: req.user.name,
      },
    ],
  });
  await rental.save();

  property.status = 'reserved';
  await property.save();

  lead.stage = 'pending_rental_verification';
  lead.recordActivity({
    type: 'rental_submitted',
    message: `Rental submitted for verification (NPR ${monthlyRent.toLocaleString()}/month × ${durationInMonths} months)`,
    by: req.user._id,
    byName: req.user.name,
  });
  await lead.save();

  const admins = await User.find({ role: 'admin' }).select('_id');
  await notifyMany(
    admins.map((a) => a._id),
    {
      type: 'rental_submitted',
      title: 'Rental awaiting verification',
      message: `"${property.title}" filed by ${req.user.name} at NPR ${monthlyRent.toLocaleString()}/month`,
      rental: rental._id,
      property: property._id,
      lead: lead._id,
      link: '/dashboard/admin/rentals',
    }
  );

  await rental.populate([
    { path: 'property', select: 'title' },
    { path: 'lead', select: 'name' },
  ]);

  res.status(201).json({ success: true, message: 'Rental submitted for verification', rental });
});

/**
 * @desc    List rentals (admin all / agent own) with queue counters
 * @route   GET /api/rentals
 */
const getRentals = asyncHandler(async (req, res) => {
  const { status, paymentFrequency, from, to, search, agent, sort, page = 1, limit = 10 } = req.query;

  const query = {};
  if (req.user.role !== 'admin') {
    query.agent = req.user._id;
  } else if (agent) {
    if (!mongoose.Types.ObjectId.isValid(agent)) {
      return res.status(400).json({ success: false, message: 'Invalid agent filter' });
    }
    query.agent = new mongoose.Types.ObjectId(agent);
  }
  if (status) {
    if (!Rental.STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${Rental.STATUSES.join(', ')}`,
      });
    }
    query.status = status;
  }
  if (paymentFrequency) query.paymentFrequency = paymentFrequency;
  if (from || to) {
    const fromDate = parseDateParam(from);
    const toDate = parseDateParam(to);
    if (from && !fromDate) return res.status(400).json({ success: false, message: 'Invalid "from" date' });
    if (to && !toDate) return res.status(400).json({ success: false, message: 'Invalid "to" date' });
    query.submittedAt = {};
    if (fromDate) query.submittedAt.$gte = fromDate;
    if (toDate) query.submittedAt.$lte = toDate;
  }
  if (search) query['tenant.name'] = { $regex: search, $options: 'i' };

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 1), 100);
  const skip = (pageNum - 1) * limitNum;

  const baseFilter = { ...query };
  delete baseFilter.status;

  const [rentals, total, statusCounts] = await Promise.all([
    Rental.find(query)
      .populate('property', 'title slug price status media.coverImage')
      .populate('lead', 'name email phone')
      .populate('agent', 'name email')
      .populate('reviewedBy', 'name')
      .populate('tenant.user', 'name email')
      .sort(rentalSortMap[sort] || rentalSortMap.newest)
      .skip(skip)
      .limit(limitNum),
    Rental.countDocuments(query),
    Rental.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const countsByStatus = {};
  Rental.STATUSES.forEach((s) => (countsByStatus[s] = 0));
  statusCounts.forEach(({ _id, count }) => (countsByStatus[_id] = count));

  res.json({
    success: true,
    count: rentals.length,
    rentals,
    pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    countsByStatus,
  });
});

/**
 * @desc    Get a single rental with full context
 * @route   GET /api/rentals/:id
 */
const getRentalById = asyncHandler(async (req, res) => {
  const rental = await Rental.findById(req.params.id).populate('lead', 'assignedAgent');
  if (!rental) {
    return res.status(404).json({ success: false, message: 'Rental not found' });
  }

  const isFilingAgent = String(rental.agent) === String(req.user._id);
  const isLeadAgent = Boolean(
    rental.lead &&
      rental.lead.assignedAgent &&
      String(rental.lead.assignedAgent._id ?? rental.lead.assignedAgent) === String(req.user._id)
  );
  if (req.user.role !== 'admin' && !isFilingAgent && !isLeadAgent) {
    return res.status(403).json({ success: false, message: 'You are not authorized to view this rental' });
  }

  await rental.populate([
    { path: 'property', select: 'title slug price status saleType media.coverImage listedBy' },
    { path: 'lead' },
    { path: 'agent', select: 'name email' },
    { path: 'reviewedBy', select: 'name' },
    { path: 'tenant.user', select: 'name email phone' },
  ]);

  res.json({ success: true, rental });
});

/**
 * @desc    Admin verifies a pending rental -> property rented, lead closed, commission recorded
 * @route   PATCH /api/rentals/:id/verify
 * @access  Private (admin)
 */
const verifyRental = asyncHandler(async (req, res) => {
  const rental = await Rental.findById(req.params.id);
  if (!rental) {
    return res.status(404).json({ success: false, message: 'Rental not found' });
  }
  if (rental.status !== 'pending_review') {
    return res.status(409).json({
      success: false,
      message: `Only pending rentals can be verified (current status: ${rental.status}).`,
    });
  }

  const property = await Property.findById(rental.property).populate(
    'propertyType',
    'defaultCommissionPercentage'
  );
  if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

  const lead = await Lead.findById(rental.lead);
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

  // 🔑 Commission basis is the LEASE VALUE (rent × duration), not a sale price.
  const pct = effectiveCommissionPercentage(property, property.propertyType);
  const leaseValue = rental.monthlyRent * rental.durationInMonths;
  const commissionAmount = Number(((leaseValue * pct) / 100).toFixed(2));

  await runWithTransaction(async (session) => {
    rental.status = 'verified';
    rental.reviewedBy = req.user._id;
    rental.reviewedAt = new Date();
    rental.recordActivity({
      type: 'verified',
      message: `Rental verified by ${req.user.name}. Commission ${pct}% of lease value NPR ${leaseValue.toLocaleString()} = NPR ${commissionAmount.toLocaleString()}.`,
      by: req.user._id,
      byName: req.user.name,
    });
    await rental.save(opts(session));

    property.status = 'rented'; // 🔑 not 'sold'
    property.rentedFrom = rental.startDate;
    const until = new Date(rental.startDate);
    until.setMonth(until.getMonth() + rental.durationInMonths);
    property.rentedUntil = until;
    property.tenant = rental.tenant.user || null;
    await property.save(opts(session));

    lead.stage = 'closed';
    lead.closedAt = lead.closedAt || new Date();
    lead.recordActivity({
      type: 'rental_verified',
      message: `Rental verified - lead closed. Property "${property.title}" marked rented.`,
      by: req.user._id,
      byName: req.user.name,
    });
    await lead.save(opts(session));

    return CommissionRecord.create(
      [
        {
          // 🔑 Reference the rental, not a sale — see "CommissionRecord" note below
          rental: rental._id,
          sale: null,
          property: property._id,
          agent: rental.agent,
          saleAmount: leaseValue, // rename conceptually to "transactionAmount" if you can
          commissionPercentage: pct,
          commissionAmount,
          isPaid: false,
        },
      ],
      opts(session)
    );
  });

  await notify({
    recipient: rental.agent,
    type: 'rental_verified',
    title: 'Rental verified',
    message: `Your rental for "${property.title}" was verified by ${req.user.name}. Commission NPR ${commissionAmount.toLocaleString()} recorded.`,
    rental: rental._id,
    property: property._id,
    link: '/dashboard/agent/rentals',
  });

  res.json({
    success: true,
    message: 'Rental verified. Property marked as rented, lead closed and commission recorded.',
    rental,
    commission: { percentage: pct, amount: commissionAmount, leaseValue },
  });
});

/**
 * @desc    Admin rejects a pending rental -> property available, lead back to negotiation
 * @route   PATCH /api/rentals/:id/reject
 */
const rejectRental = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'A rejection reason is required' });
  }
  const trimmedReason = String(reason).trim();

  const rental = await Rental.findById(req.params.id);
  if (!rental) return res.status(404).json({ success: false, message: 'Rental not found' });
  if (rental.status !== 'pending_review') {
    return res.status(409).json({
      success: false,
      message: `Only pending rentals can be rejected (current status: ${rental.status}).`,
    });
  }

  const property = await Property.findById(rental.property);
  if (!property) return res.status(404).json({ success: false, message: 'Property not found' });
  const lead = await Lead.findById(rental.lead);
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

  await runWithTransaction(async (session) => {
    rental.status = 'rejected';
    rental.rejectionReason = trimmedReason;
    rental.reviewedBy = req.user._id;
    rental.reviewedAt = new Date();
    rental.recordActivity({
      type: 'rejected',
      message: `Rental rejected by ${req.user.name}: ${trimmedReason}`,
      by: req.user._id,
      byName: req.user.name,
    });
    await rental.save(opts(session));

    property.status = 'available';
    await property.save(opts(session));

    lead.stage = 'negotiation';
    lead.recordActivity({
      type: 'rental_rejected',
      message: `Rental rejected by admin: ${trimmedReason} — lead returned to negotiation.`,
      by: req.user._id,
      byName: req.user.name,
    });
    await lead.save(opts(session));
  });

  await notify({
    recipient: rental.agent,
    type: 'rental_rejected',
    title: 'Rental rejected',
    message: `Your rental for "${property.title}" was rejected: ${trimmedReason}`,
    rental: rental._id,
    property: property._id,
    link: '/dashboard/agent/rentals',
  });

  res.json({
    success: true,
    message: 'Rental rejected. Property returned to available and lead returned to negotiation.',
    rental,
  });
});

module.exports = { createRental, getRentals, getRentalById, verifyRental, rejectRental };