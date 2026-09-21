const mongoose = require('mongoose');
const Rental = require('../models/Rental');
const CommissionRecord = require('../models/CommissionRecord');
const Lead = require('../models/Lead');
const Property = require('../models/Property');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyMany } = require('../utils/notify');
const { runWithTransaction, opts } = require('../utils/withTransaction');
const {
  isValidRequiredNote,
  isValidOptionalNote,
  requiredNoteMessage,
  optionalNoteMessage,
} = require('../utils/validateNotes');

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
    startDate,
    securityDeposit,
    remarks,
  } = req.body;
  let { monthlyRent, durationInMonths } = req.body;
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

  // A lead is locked to one deal type the first time a deal is filed - a lead
  // already locked to 'sale' needs a new Lead for a rental.
  if (!lead.lockDealType('rental')) {
    return res.status(400).json({
      success: false,
      message: 'This lead is locked to sale deals. Create a new lead to file a rental.',
    });
  }

  // Lead stage guards — same pattern as Sale, one shared verification stage
  if (lead.stage === 'pending_verification') {
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
  if (!isValidOptionalNote(remarks)) {
    return res.status(400).json({ success: false, message: optionalNoteMessage('Remarks') });
  }
  {
    const { toFiniteNumber } = require('../utils/validateMoney');
    const rent = toFiniteNumber(monthlyRent);
    if (rent === null || rent <= 0 || rent > 1e11) {
      return res
        .status(400)
        .json({ success: false, message: 'Monthly rent must be a positive number up to NPR 100,000,000,000' });
    }
    monthlyRent = rent;
  }
  {
    // Optional - absent/empty means an open-ended (month-to-month) tenancy.
    if (durationInMonths === undefined || durationInMonths === null || durationInMonths === '') {
      durationInMonths = null;
    } else {
      const duration = Number(durationInMonths);
      if (!Number.isInteger(duration) || duration < 1 || duration > 360) {
        return res
          .status(400)
          .json({ success: false, message: 'Lease duration must be a whole number of months between 1 and 360, or left empty for an open-ended tenancy' });
      }
      durationInMonths = duration;
    }
  }
  {
    const { toFiniteNumber } = require('../utils/validateMoney');
    if (securityDeposit !== undefined && securityDeposit !== null && securityDeposit !== '') {
      const deposit = toFiniteNumber(securityDeposit);
      if (deposit === null || deposit < 0 || deposit > 1e11) {
        return res.status(400).json({ success: false, message: 'Security deposit must be a number between 0 and NPR 100,000,000,000' });
      }
      // No lease value exists for open-ended tenancies, so the cap only
      // applies when a duration was provided.
      if (durationInMonths !== null) {
        const leaseValue = monthlyRent * durationInMonths;
        if (deposit > leaseValue) {
          return res.status(400).json({ success: false, message: `Security deposit cannot exceed the lease value (NPR ${leaseValue.toLocaleString()})` });
        }
      }
    }
  }
  if (!startDate) {
    return res.status(400).json({ success: false, message: 'Lease start date is required' });
  }
  const parsedStartDate = new Date(startDate);
  if (Number.isNaN(parsedStartDate.getTime())) {
    return res.status(400).json({ success: false, message: 'Invalid lease start date' });
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
    startDate: parsedStartDate,
    securityDeposit: (() => {
      const { toFiniteNumber } = require('../utils/validateMoney');
      if (securityDeposit === undefined || securityDeposit === null || securityDeposit === '') return 0;
      const n = toFiniteNumber(securityDeposit);
      return n === null ? 0 : n;
    })(),
    remarks: remarks || '',
    status: 'pending_review',
    submittedBy: req.user._id,
    submittedAt: new Date(),
    activities: [
      {
        type: 'submitted',
        message: `Rental filed for "${property.title}" at NPR ${monthlyRent.toLocaleString()}/month${durationInMonths !== null ? ` × ${durationInMonths} months` : ' (open-ended)'}`,
        by: req.user._id,
        byName: req.user.name,
      },
    ],
  });

  // Reserve the property and freeze the lead in the verification stage while
  // an admin reviews the filing - all three writes commit or none do.
  await runWithTransaction(async (session) => {
    await rental.save(opts(session));

    property.status = 'reserved';
    await property.save(opts(session));

    lead.stage = 'pending_verification';
    lead.recordActivity({
      type: 'rental_submitted',
      message: `Rental submitted for verification (NPR ${monthlyRent.toLocaleString()}/month${durationInMonths !== null ? ` × ${durationInMonths} months` : ' (open-ended)'})`,
      by: req.user._id,
      byName: req.user.name,
    });
    await lead.save(opts(session));
  });

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
  const { status, from, to, search, agent, sort, page = 1, limit = 10 } = req.query;

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
      .populate('agent', 'name email')
      .populate('reviewedBy', 'name')
      .sort(rentalSortMap[sort] || rentalSortMap.newest)
      .skip(skip)
      .limit(limitNum),
    Rental.countDocuments(query),
    Rental.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  // Same list contract as sales: tenant scalars + registered flag, no tenant
  // object, no lead object, no activities history.
  const items = rentals.map((r) => {
    const o = r.toObject();
    o.tenant = {
      name: o.tenant?.name,
      phone: o.tenant?.phone,
      email: o.tenant?.email,
      registered: Boolean(o.tenant?.user),
    };
    delete o.activities;
    return o;
  });

  const countsByStatus = {};
  Rental.STATUSES.forEach((s) => (countsByStatus[s] = 0));
  statusCounts.forEach(({ _id, count }) => (countsByStatus[_id] = count));

  res.json({
    success: true,
    count: items.length,
    rentals: items,
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
    { path: 'lead', select: '_id name email phone stage assignedAgent', populate: { path: 'assignedAgent', select: '_id name' } },
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
 *
 * NOTE: this deliberately diverges from verifySale - the commission here is
 * entered by the admin by hand (no automatic calculation). Do not "fix" it
 * back to auto-calculating for consistency.
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

  // The admin enters the commission amount by hand - a missing, non-numeric
  // or negative value is rejected. Zero is a legitimate "no commission" case.
  const { commissionAmount: rawAmount } = req.body || {};
  if (rawAmount === undefined || rawAmount === null || rawAmount === '') {
    return res.status(400).json({
      success: false,
      message: 'commissionAmount is required to verify a rental.',
    });
  }
  const commissionAmount = Number(rawAmount);
  if (!Number.isFinite(commissionAmount) || commissionAmount < 0) {
    return res.status(400).json({
      success: false,
      message: 'commissionAmount must be a non-negative number.',
    });
  }

  const property = await Property.findById(rental.property);
  if (!property) return res.status(404).json({ success: false, message: 'Property not found' });

  const lead = await Lead.findById(rental.lead);
  if (!lead) return res.status(404).json({ success: false, message: 'Lead not found' });

  // Lease value is the commission basis. The percentage below is derived from
  // the admin-entered amount purely for the existing required field and for
  // reporting consistency with Sale-originated records - it is informational
  // only and never used to recompute or validate the amount.
  // Open-ended tenancies (no duration) use one month's rent as the basis and
  // leave rentedUntil unset.
  const leaseValue = rental.durationInMonths !== null && rental.durationInMonths !== undefined
    ? rental.monthlyRent * rental.durationInMonths
    : rental.monthlyRent;
  const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
  const pct = leaseValue > 0 ? round2((commissionAmount / leaseValue) * 100) : 0;

  await runWithTransaction(async (session) => {
    rental.status = 'verified';
    rental.reviewedBy = req.user._id;
    rental.reviewedAt = new Date();
    rental.recordActivity({
      type: 'verified',
      message: `Rental verified by ${req.user.name}. Commission NPR ${commissionAmount.toLocaleString()} recorded (${pct}% of lease value NPR ${leaseValue.toLocaleString()}).`,
      by: req.user._id,
      byName: req.user.name,
    });
    await rental.save(opts(session));

    property.status = 'rented'; // 🔑 not 'sold'
    property.rentedFrom = rental.startDate;
    if (rental.durationInMonths !== null && rental.durationInMonths !== undefined) {
      const until = new Date(rental.startDate);
      until.setMonth(until.getMonth() + rental.durationInMonths);
      property.rentedUntil = until;
    } else {
      property.rentedUntil = null; // open-ended tenancy - no fixed end date
    }
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
          // 🔑 Reference the rental, not a sale
          rental: rental._id,
          sale: null,
          property: property._id,
          agent: rental.agent,
          transactionAmount: leaseValue,
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
    link: '/dashboard/agent/deals?type=rental',
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
  if (!isValidRequiredNote(reason)) {
    return res.status(400).json({ success: false, message: requiredNoteMessage('Rejection reason') });
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
    link: '/dashboard/agent/deals?type=rental',
  });

  res.json({
    success: true,
    message: 'Rental rejected. Property returned to available and lead returned to negotiation.',
    rental,
  });
});

module.exports = { createRental, getRentals, getRentalById, verifyRental, rejectRental };