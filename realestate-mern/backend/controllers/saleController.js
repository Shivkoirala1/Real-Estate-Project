const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const CommissionRecord = require('../models/CommissionRecord');
const Lead = require('../models/Lead');
const Property = require('../models/Property');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyMany } = require('../utils/notify');
const { runWithTransaction, opts } = require('../utils/withTransaction');
const { effectiveCommissionPercentage } = require('../utils/commission');

// ---------- helpers ----------

// Parse a query date string, returning null when it cannot be understood
const parseDateParam = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const saleSortMap = {
  newest: { submittedAt: -1 },
  oldest: { submittedAt: 1 },
  amount_desc: { agreedPrice: -1 },
  amount_asc: { agreedPrice: 1 },
};

/**
 * @desc    Agent files a sale on a lead -> lands in the admin verification queue
 * @route   POST /api/sales
 * @access  Private (admin or assigned agent)
 */
const createSale = asyncHandler(async (req, res) => {
  const { leadId, agreedPrice, paymentType, downPaymentAmount, remarks } = req.body;
  const buyer = req.body.buyer || {};

  if (!leadId) {
    return res.status(400).json({ success: false, message: 'leadId is required to file a sale' });
  }

  const lead = await Lead.findById(leadId);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }

  // Admins may file on behalf of the team; otherwise only the lead owner
  const isAuthorized =
    req.user.role === 'admin' ||
    (lead.assignedAgent && String(lead.assignedAgent) === String(req.user._id));
  if (!isAuthorized) {
    return res
      .status(403)
      .json({ success: false, message: 'Only the assigned agent can submit a sale for this lead' });
  }

  if (!lead.property) {
    return res.status(400).json({
      success: false,
      message: 'This lead has no linked property to sell. Add the property to the lead first.',
    });
  }

  // Stage guards: 'negotiation' is the canonical filing stage (rejected sales
  // revert there, so resubmission works), a lead already awaiting verification
  // cannot be double-filed, and closed/lost leads are dead ends.
  if (lead.stage === 'pending_sale_verification') {
    return res.status(409).json({
      success: false,
      message: 'A sale has already been submitted for this lead and is awaiting verification.',
    });
  }
  if (lead.stage === 'closed' || lead.stage === 'lost') {
    return res
      .status(400)
      .json({ success: false, message: 'A sale cannot be filed on a closed or lost lead.' });
  }

  if (!buyer.name || !String(buyer.name).trim()) {
    return res.status(400).json({ success: false, message: 'Buyer name is required' });
  }
  if (typeof agreedPrice !== 'number' || !Number.isFinite(agreedPrice) || agreedPrice <= 0) {
    return res
      .status(400)
      .json({ success: false, message: 'Agreed price must be a number greater than 0' });
  }
  if (!Sale.PAYMENT_TYPES.includes(paymentType)) {
    return res.status(400).json({
      success: false,
      message: `Payment type must be one of: ${Sale.PAYMENT_TYPES.join(', ')}`,
    });
  }
  // Auto-link the buyer to a registered platform account by email when no
  // explicit user id was provided - agents usually only know the buyer's
  // email. Linked accounts power the EMI dashboard and the "Registered" chip.
  if (!buyer.user && buyer.email) {
    const registeredBuyer = await User.findOne({
      email: String(buyer.email).trim().toLowerCase(),
    }).select('_id name email');
    if (registeredBuyer) {
      buyer.user = registeredBuyer._id;
    }
  }
  if (paymentType === 'emi' && !buyer.user) {
    return res.status(400).json({
      success: false,
      message:
        'EMI sales require the buyer to have a registered platform account so the EMI plan can be linked to them. Make sure the buyer email belongs to a registered user, or have the buyer register first.',
    });
  }

  const property = await Property.findById(lead.property);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }
  if (property.status === 'sold') {
    return res.status(409).json({ success: false, message: 'This property is already sold.' });
  }
  if (property.status === 'reserved') {
    // A reservation without a live filing is stale - only block when another
    // sale is actively awaiting verification on this property.
    const pendingSale = await Sale.findOne({ property: property._id, status: 'pending_review' });
    if (pendingSale) {
      return res
        .status(409)
        .json({ success: false, message: 'This property is already reserved by a pending sale.' });
    }
  }

  // The filing agent is the lead owner; an admin filing directly credits the
  // lead's assigned agent (or themselves when the lead is unassigned).
  const agentId = req.user.role === 'agent' ? req.user._id : lead.assignedAgent || req.user._id;

  const sale = new Sale({
    lead: lead._id,
    property: property._id,
    agent: agentId,
    buyer: {
      name: String(buyer.name).trim(),
      phone: buyer.phone || '',
      email: buyer.email || '',
      user: buyer.user || null,
    },
    agreedPrice,
    paymentType,
    downPaymentAmount: downPaymentAmount ?? null,
    remarks: remarks || '',
    status: 'pending_review',
    submittedBy: req.user._id,
    submittedAt: new Date(),
    activities: [
      {
        type: 'submitted',
        message: `Sale filed for "${property.title}" at NPR ${agreedPrice}`,
        by: req.user._id,
        byName: req.user.name,
      },
    ],
  });
  await sale.save();

  // Reserve the property and freeze the lead in the verification stage while
  // an admin reviews the filing.
  property.status = 'reserved';
  await property.save();

  lead.stage = 'pending_sale_verification';
  lead.recordActivity({
    type: 'sale_submitted',
    message: `Sale submitted for verification (NPR ${agreedPrice}, ${paymentType.replace(/_/g, ' ')})`,
    by: req.user._id,
    byName: req.user.name,
  });
  await lead.save();

  // Alert every admin - the verification queue is their inbox
  const admins = await User.find({ role: 'admin' }).select('_id');
  await notifyMany(
    admins.map((a) => a._id),
    {
      type: 'sale_submitted',
      title: 'Sale awaiting verification',
      message: `"${property.title}" filed by ${req.user.name} at NPR ${agreedPrice.toLocaleString()}`,
      sale: sale._id,
      property: property._id,
      lead: lead._id,
      link: '/dashboard/admin/sales',
    }
  );

  await sale.populate([
    { path: 'property', select: 'title' },
    { path: 'lead', select: 'name' },
  ]);

  res.status(201).json({
    success: true,
    message: 'Sale submitted for verification',
    sale,
  });
});

/**
 * @desc    List sales (admin sees all, agent sees own filings) with queue counters
 * @route   GET /api/sales
 * @access  Private (admin/agent)
 */
const getSales = asyncHandler(async (req, res) => {
  const { status, paymentType, from, to, search, agent, sort, page = 1, limit = 10 } = req.query;

  const query = {};

  // Agents only ever see their own filings; admins see everything
  if (req.user.role !== 'admin') {
    query.agent = req.user._id;
  } else if (agent) {
    if (!mongoose.Types.ObjectId.isValid(agent)) {
      return res.status(400).json({ success: false, message: 'Invalid agent filter' });
    }
    // Cast up front so both the find and the counts aggregate can use it
    query.agent = new mongoose.Types.ObjectId(agent);
  }

  if (status) {
    if (!Sale.STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${Sale.STATUSES.join(', ')}`,
      });
    }
    query.status = status;
  }
  if (paymentType) {
    if (!Sale.PAYMENT_TYPES.includes(paymentType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment type. Must be one of: ${Sale.PAYMENT_TYPES.join(', ')}`,
      });
    }
    query.paymentType = paymentType;
  }
  if (from || to) {
    const fromDate = parseDateParam(from);
    const toDate = parseDateParam(to);
    if (from && !fromDate) {
      return res.status(400).json({ success: false, message: 'Invalid "from" date' });
    }
    if (to && !toDate) {
      return res.status(400).json({ success: false, message: 'Invalid "to" date' });
    }
    query.submittedAt = {};
    if (fromDate) query.submittedAt.$gte = fromDate;
    if (toDate) query.submittedAt.$lte = toDate;
  }
  if (search) {
    query['buyer.name'] = { $regex: search, $options: 'i' };
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 1), 100); // hard cap 100
  const skip = (pageNum - 1) * limitNum;

  // Queue tab counters use the same filters minus the status itself
  const baseFilter = { ...query };
  delete baseFilter.status;

  const [sales, total, statusCounts] = await Promise.all([
    Sale.find(query)
      .populate('property', 'title slug price status media.coverImage')
      .populate('lead', 'name email phone')
      .populate('agent', 'name email')
      .populate('reviewedBy', 'name')
      // buyer.user lets the UI show a "Registered" chip on the buyer block
      .populate('buyer.user', 'name email')
      .sort(saleSortMap[sort] || saleSortMap.newest)
      .skip(skip)
      .limit(limitNum),
    Sale.countDocuments(query),
    Sale.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const countsByStatus = {};
  Sale.STATUSES.forEach((s) => {
    countsByStatus[s] = 0;
  });
  statusCounts.forEach(({ _id, count }) => {
    countsByStatus[_id] = count;
  });

  res.json({
    success: true,
    count: sales.length,
    sales,
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
 * @desc    Get a single sale with full context
 * @route   GET /api/sales/:id
 * @access  Private (admin, filing agent, or the lead's assigned agent)
 */
const getSaleById = asyncHandler(async (req, res) => {
  const sale = await Sale.findById(req.params.id).populate('lead', 'assignedAgent');
  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }

  const isFilingAgent = String(sale.agent) === String(req.user._id);
  const isLeadAgent = Boolean(
    sale.lead &&
      sale.lead.assignedAgent &&
      // assignedAgent is populated here - compare its _id (String() on a
      // populated document returns the object, not the id)
      String(sale.lead.assignedAgent._id ?? sale.lead.assignedAgent) === String(req.user._id)
  );
  if (req.user.role !== 'admin' && !isFilingAgent && !isLeadAgent) {
    return res
      .status(403)
      .json({ success: false, message: 'You are not authorized to view this sale' });
  }

  // Re-populate the lead in full now that access is confirmed
  await sale.populate([
    { path: 'property', select: 'title slug price status propertyType media.coverImage listedBy' },
    { path: 'lead' },
    { path: 'agent', select: 'name email' },
    { path: 'reviewedBy', select: 'name' },
    { path: 'buyer.user', select: 'name email phone' },
  ]);

  res.json({ success: true, sale });
});

/**
 * @desc    Admin verifies a pending sale -> property sold, lead closed, commission recorded
 * @route   PATCH /api/sales/:id/verify
 * @access  Private (admin)
 */
const verifySale = asyncHandler(async (req, res) => {
  const sale = await Sale.findById(req.params.id);
  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }
  if (sale.status !== 'pending_review') {
    return res.status(409).json({
      success: false,
      message: `Only pending sales can be verified (current status: ${sale.status}).`,
    });
  }

  const property = await Property.findById(sale.property).populate(
    'propertyType',
    'defaultCommissionPercentage'
  );
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }
  const lead = await Lead.findById(sale.lead);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }

  // Effective commission %: the property override wins, otherwise the parent
  // property type's default, otherwise 0 (no commission configured anywhere).
  const pct = effectiveCommissionPercentage(property, property.propertyType);
  const commissionAmount = Number(((sale.agreedPrice * pct) / 100).toFixed(2));

  // One transaction: sale + property + lead + commission record all commit or
  // none do (standalone deployments fall back to sequential writes).
  await runWithTransaction(async (session) => {
    sale.status = 'verified';
    sale.reviewedBy = req.user._id;
    sale.reviewedAt = new Date();
    sale.recordActivity({
      type: 'verified',
      message: `Sale verified by ${req.user.name}. Commission ${pct}% (NPR ${commissionAmount.toLocaleString()}) generated.`,
      by: req.user._id,
      byName: req.user.name,
    });
    await sale.save(opts(session));

    property.status = 'sold';
    await property.save(opts(session));

    lead.stage = 'closed';
    lead.closedAt = lead.closedAt || new Date();
    lead.recordActivity({
      type: 'sale_verified',
      message: `Sale verified - lead closed. Property "${property.title}" marked sold.`,
      by: req.user._id,
      byName: req.user.name,
    });
    await lead.save(opts(session));

    const created = await CommissionRecord.create(
      [
        {
          sale: sale._id,
          property: property._id,
          agent: sale.agent,
          saleAmount: sale.agreedPrice,
          commissionPercentage: pct,
          commissionAmount,
          isPaid: false,
        },
      ],
      opts(session)
    );

    return created[0];
  });

  // Notifications run after the transaction so they can never be rolled back
  // or duplicated by a transaction retry.
  let agentMessage = `Your sale for "${property.title}" was verified by ${req.user.name}. Commission NPR ${commissionAmount.toLocaleString()} recorded.`;
  if (sale.paymentType === 'emi') {
    agentMessage += ' — please initialize the EMI plan for this sale.';
  }
  await notify({
    recipient: sale.agent,
    type: 'sale_verified',
    title: 'Sale verified',
    message: agentMessage,
    sale: sale._id,
    property: property._id,
    link: '/dashboard/agent/sales',
  });

  res.json({
    success: true,
    message: 'Sale verified. Property marked as sold, lead closed and commission recorded.',
    sale,
    commission: {
      percentage: pct,
      amount: commissionAmount,
      paymentType: sale.paymentType,
      requiresEmiPlan: sale.paymentType === 'emi',
    },
  });
});

/**
 * @desc    Admin rejects a pending sale -> property available again, lead back to negotiation
 * @route   PATCH /api/sales/:id/reject
 * @access  Private (admin)
 */
const rejectSale = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ success: false, message: 'A rejection reason is required' });
  }
  const trimmedReason = String(reason).trim();

  const sale = await Sale.findById(req.params.id);
  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }
  if (sale.status !== 'pending_review') {
    return res.status(409).json({
      success: false,
      message: `Only pending sales can be rejected (current status: ${sale.status}).`,
    });
  }

  const property = await Property.findById(sale.property);
  if (!property) {
    return res.status(404).json({ success: false, message: 'Property not found' });
  }
  const lead = await Lead.findById(sale.lead);
  if (!lead) {
    return res.status(404).json({ success: false, message: 'Lead not found' });
  }

  await runWithTransaction(async (session) => {
    sale.status = 'rejected';
    sale.rejectionReason = trimmedReason;
    sale.reviewedBy = req.user._id;
    sale.reviewedAt = new Date();
    sale.recordActivity({
      type: 'rejected',
      message: `Sale rejected by ${req.user.name}: ${trimmedReason}`,
      by: req.user._id,
      byName: req.user.name,
    });
    await sale.save(opts(session));

    // The reservation was held only by this pending filing - release it
    property.status = 'available';
    await property.save(opts(session));

    // The agent fixes whatever was wrong and refiles from negotiation
    lead.stage = 'negotiation';
    lead.recordActivity({
      type: 'sale_rejected',
      message: `Sale rejected by admin: ${trimmedReason} — lead returned to negotiation.`,
      by: req.user._id,
      byName: req.user.name,
    });
    await lead.save(opts(session));
  });

  await notify({
    recipient: sale.agent,
    type: 'sale_rejected',
    title: 'Sale rejected',
    message: `Your sale for "${property.title}" was rejected: ${trimmedReason}`,
    sale: sale._id,
    property: property._id,
    link: '/dashboard/agent/sales',
  });

  res.json({
    success: true,
    message: 'Sale rejected. Property returned to available and lead returned to negotiation.',
    sale,
  });
});

module.exports = {
  createSale,
  getSales,
  getSaleById,
  verifySale,
  rejectSale,
};
