const EMIPlan = require('../models/EMIPlan');
const Sale = require('../models/Sale');
const asyncHandler = require('../utils/asyncHandler');

const PLAN_STATUSES = EMIPlan.STATUSES;
const INSTALLMENT_STATUSES = EMIPlan.INSTALLMENT_STATUSES;

// ---------- helpers ----------

// Adds `months` months to a date, clamping end-of-month overflow so
// Jan 31 + 1 month lands on Feb 28/29 instead of rolling over into March.
const addMonths = (date, months) => {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setMonth(result.getMonth() + months);
  if (result.getDate() !== day) {
    result.setDate(0); // rolled over - fall back to the last day of the target month
  }
  return result;
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// First millisecond to last millisecond of the current calendar month
const currentMonthRange = () => {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
};

const formatDate = (value) => new Date(value).toISOString().slice(0, 10);

const isParseableDate = (value) => !Number.isNaN(new Date(value).getTime());

const npr = (value) => `NPR ${Number(value).toLocaleString()}`;

const LIST_POPULATE = [
  { path: 'property', select: 'title slug media.coverImage' },
  { path: 'buyer', select: 'name email' },
  { path: 'agent', select: 'name email' },
  { path: 'sale', select: 'agreedPrice paymentType' },
];

const DETAIL_POPULATE = [
  { path: 'property', select: 'title slug media.coverImage' },
  { path: 'buyer', select: 'name email phone' },
  { path: 'agent', select: 'name email phone' },
  { path: 'sale', select: 'agreedPrice paymentType buyer' },
];

// Write access: admins and the plan's assigned agent. Works with both an
// unpopulated ObjectId and a populated document.
const canManage = (plan, user) => {
  if (user.role === 'admin') return true;
  const agentId = plan.agent && plan.agent._id ? plan.agent._id : plan.agent;
  return Boolean(agentId) && String(agentId) === String(user._id);
};

/**
 * @desc    Create an EMI plan for a verified sale with paymentType = emi
 * @route   POST /api/emi-plans
 * @access  Private (admin/agent)
 */
const createEmiPlan = asyncHandler(async (req, res) => {
  const { saleId, principalAmount, tenureMonths, installmentAmount, startDate, remarks } = req.body;

  // ---- body validation ----
  if (!saleId) {
    return res.status(400).json({ success: false, message: 'Sale ID is required' });
  }

  const principal = Number(principalAmount);
  if (!Number.isFinite(principal) || principal <= 0) {
    return res.status(400).json({ success: false, message: 'Principal amount must be a positive number' });
  }

  const tenure = Number(tenureMonths);
  if (!Number.isInteger(tenure) || tenure <= 0) {
    return res.status(400).json({ success: false, message: 'Tenure months must be a positive whole number' });
  }

  const perInstallment = Number(installmentAmount);
  if (!Number.isFinite(perInstallment) || perInstallment <= 0) {
    return res.status(400).json({ success: false, message: 'Installment amount must be a positive number' });
  }

  if (!startDate || !isParseableDate(startDate)) {
    return res.status(400).json({ success: false, message: 'A valid start date is required' });
  }

  // ---- sale eligibility ----
  const sale = await Sale.findById(saleId);
  if (!sale) {
    return res.status(404).json({ success: false, message: 'Sale not found' });
  }

  if (sale.status !== 'verified') {
    return res.status(400).json({ success: false, message: 'EMI plans can only be created for verified sales.' });
  }

  if (sale.paymentType !== 'emi') {
    return res.status(400).json({
      success: false,
      message: 'EMI plans can only be created for sales with payment type EMI.',
    });
  }

  // Only the filing agent (or an admin) manages a sale's EMI plan
  if (String(sale.agent) !== String(req.user._id) && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Only the agent who filed the sale (or an admin) can manage its EMI plan.',
    });
  }

  const existing = await EMIPlan.findOne({ sale: sale._id });
  if (existing) {
    return res.status(409).json({ success: false, message: 'An EMI plan already exists for this sale.' });
  }

  if (!sale.buyer || !sale.buyer.user) {
    return res.status(400).json({
      success: false,
      message: 'This sale has no registered buyer account. EMI plans must be linked to the buyer platform account.',
    });
  }

  // ---- build the flat schedule (no auto-amortization per spec) ----
  const start = new Date(startDate);
  const installments = [];
  for (let n = 1; n <= tenure; n += 1) {
    installments.push({
      installmentNumber: n,
      dueDate: addMonths(start, n),
      amount: perInstallment,
      status: 'pending',
      paidDate: null,
      paidAmount: null,
      remarks: '',
    });
  }

  const activities = [
    {
      type: 'initialized',
      message: `EMI plan initialized: ${tenure} installments of ${npr(perInstallment)} starting ${formatDate(start)}`,
      by: req.user._id,
      byName: req.user.name,
    },
  ];
  if (typeof remarks === 'string' && remarks.trim()) {
    activities.push({
      type: 'note_added',
      message: `Plan note: ${remarks.trim()}`,
      by: req.user._id,
      byName: req.user.name,
    });
  }

  const plan = new EMIPlan({
    sale: sale._id,
    property: sale.property,
    buyer: sale.buyer.user,
    agent: sale.agent,
    principalAmount: principal,
    tenureMonths: tenure,
    installmentAmount: perInstallment,
    startDate: start,
    installments,
    status: 'active',
    activities,
  });

  try {
    await plan.save();
  } catch (err) {
    // The unique index on `sale` guards against a race between two creates
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'An EMI plan already exists for this sale.' });
    }
    throw err;
  }

  await plan.populate(DETAIL_POPULATE);

  res.status(201).json({
    success: true,
    message: 'EMI plan created',
    plan,
  });
});

/**
 * @desc    List EMI plans with filters + dashboard summary
 * @route   GET /api/emi-plans
 * @access  Private (admin sees all, agent sees own)
 */
const getEmiPlans = asyncHandler(async (req, res) => {
  const { status, overdue, dueThisMonth, agent, buyer, page = 1, limit = 10 } = req.query;

  const query = {};
  const summaryScope = {};

  if (req.user.role === 'admin') {
    // Admins see everything, with optional agent/buyer narrowing
    if (agent) {
      query.agent = agent;
      summaryScope.agent = agent;
    }
    if (buyer) {
      query.buyer = buyer;
      summaryScope.buyer = buyer;
    }
  } else {
    // Agents only ever see plans they manage
    query.agent = req.user._id;
    summaryScope.agent = req.user._id;
  }

  if (status && !PLAN_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status filter' });
  }
  // Status list filter only narrows the table - the summary stays scoped to
  // the requester (agent) so the dashboard cards remain stable while filtering.
  if (status) {
    query.status = status;
  }

  // 'overdue' and 'dueThisMonth' match against the embedded installments.
  // 'overdue' is computed (never stored): pending + dueDate before today.
  if (overdue === 'true') {
    query.installments = { $elemMatch: { status: 'pending', dueDate: { $lt: startOfToday() } } };
  } else if (dueThisMonth === 'true') {
    const { start, end } = currentMonthRange();
    query.installments = { $elemMatch: { status: 'pending', dueDate: { $gte: start, $lte: end } } };
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 10), 100);
  const skip = (pageNum - 1) * limitNum;

  // Summary is computed over the requester's scope (same agent filter as the
  // list), independent of the status/overdue/dueThisMonth list filters, so the
  // dashboard cards stay stable while the table is filtered.
  const today = startOfToday();
  const { start: monthStart, end: monthEnd } = currentMonthRange();

  // totalOutstanding mirrors the model's outstandingBalance virtual per plan:
  // principalAmount - sum(paidAmount ?? amount of paid installments), floored at 0.
  const paidExpression = {
    $sum: {
      $map: {
        input: { $filter: { input: '$installments', cond: { $eq: ['$$this.status', 'paid'] } } },
        in: { $ifNull: ['$$this.paidAmount', '$$this.amount'] },
      },
    },
  };

  const [plans, total, summaryFacets] = await Promise.all([
    EMIPlan.find(query)
      .populate(LIST_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    EMIPlan.countDocuments(query),
    EMIPlan.aggregate([
      { $match: summaryScope },
      {
        $facet: {
          activePlans: [{ $match: { status: 'active' } }, { $count: 'count' }],
          dueThisMonth: [
            { $unwind: '$installments' },
            {
              $match: {
                'installments.status': 'pending',
                'installments.dueDate': { $gte: monthStart, $lte: monthEnd },
              },
            },
            { $count: 'count' },
          ],
          overdueInstallments: [
            { $unwind: '$installments' },
            { $match: { 'installments.status': 'pending', 'installments.dueDate': { $lt: today } } },
            { $count: 'count' },
          ],
          totalOutstanding: [
            { $project: { paid: paidExpression, principal: '$principalAmount' } },
            { $project: { outstanding: { $max: [{ $subtract: ['$principal', '$paid'] }, 0] } } },
            { $group: { _id: null, total: { $sum: '$outstanding' } } },
          ],
        },
      },
    ]),
  ]);

  const facets = (summaryFacets && summaryFacets[0]) || {};
  const facetCount = (rows) => (rows && rows[0] && rows[0].count) || 0;

  res.json({
    success: true,
    count: plans.length,
    pagination: {
      total,
      pages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      limit: limitNum,
    },
    summary: {
      activePlans: facetCount(facets.activePlans),
      dueThisMonth: facetCount(facets.dueThisMonth),
      overdueInstallments: facetCount(facets.overdueInstallments),
      totalOutstanding: facets.totalOutstanding && facets.totalOutstanding[0] ? facets.totalOutstanding[0].total : 0,
    },
    plans,
  });
});

/**
 * @desc    Get a single EMI plan (admin, assigned agent, or linked buyer)
 * @route   GET /api/emi-plans/:id
 * @access  Private (admin/agent/linked buyer - buyers are read-only)
 */
const getEmiPlanById = asyncHandler(async (req, res) => {
  const plan = await EMIPlan.findById(req.params.id).populate(DETAIL_POPULATE);
  if (!plan) {
    return res.status(404).json({ success: false, message: 'EMI plan not found' });
  }

  const isAdmin = req.user.role === 'admin';
  const agentId = plan.agent && plan.agent._id ? plan.agent._id : plan.agent;
  const buyerId = plan.buyer && plan.buyer._id ? plan.buyer._id : plan.buyer;
  const isAgent = Boolean(agentId) && String(agentId) === String(req.user._id);
  const isBuyer = Boolean(buyerId) && String(buyerId) === String(req.user._id);

  if (!isAdmin && !isAgent && !isBuyer) {
    return res.status(403).json({ success: false, message: 'You are not authorized to view this EMI plan' });
  }

  res.json({
    success: true,
    plan,
    // Helps the UI hide write controls for read-only buyers
    canManage: isAdmin || isAgent,
  });
});

/**
 * @desc    Update a single installment (mark paid/pending/waived, reschedule, notes)
 * @route   PATCH /api/emi-plans/:id/installments/:n
 * @access  Private (assigned agent or admin)
 */
const updateInstallment = asyncHandler(async (req, res) => {
  const { status, paidDate, paidAmount, remarks, dueDate, amount } = req.body;

  const installmentNumber = parseInt(req.params.n, 10);
  if (!Number.isInteger(installmentNumber) || installmentNumber < 1) {
    return res.status(400).json({ success: false, message: 'Invalid installment number' });
  }

  const plan = await EMIPlan.findById(req.params.id);
  if (!plan) {
    return res.status(404).json({ success: false, message: 'EMI plan not found' });
  }

  // Buyers are read-only even if the route guard ever changes
  if (req.user.role === 'user') {
    return res.status(403).json({ success: false, message: 'Buyers have read-only access to EMI plans' });
  }
  if (!canManage(plan, req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only the assigned agent (or an admin) can update this EMI plan.',
    });
  }

  const installment = plan.installments.find((i) => i.installmentNumber === installmentNumber);
  if (!installment) {
    return res.status(404).json({ success: false, message: 'Installment not found' });
  }

  const touched = [status, paidDate, paidAmount, remarks, dueDate, amount].some((v) => v !== undefined);
  if (!touched) {
    return res.status(400).json({ success: false, message: 'No fields provided to update' });
  }

  // ---- validate the body against the CURRENT state before mutating ----
  if (status !== undefined && !INSTALLMENT_STATUSES.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status. Use pending, paid or waived' });
  }

  if (amount !== undefined) {
    if (installment.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot change the amount of a paid installment. Revert it to pending first.',
      });
    }
    const num = Number(amount);
    if (!Number.isFinite(num) || num < 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a number greater than or equal to 0' });
    }
  }

  if (dueDate !== undefined) {
    if (installment.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot reschedule a paid installment. Revert it to pending first.',
      });
    }
    if (!isParseableDate(dueDate)) {
      return res.status(400).json({ success: false, message: 'Due date is not a valid date' });
    }
  }

  if (paidDate !== undefined && paidDate !== null && !isParseableDate(paidDate)) {
    return res.status(400).json({ success: false, message: 'Paid date is not a valid date' });
  }

  if (paidAmount !== undefined && paidAmount !== null) {
    const num = Number(paidAmount);
    if (!Number.isFinite(num) || num < 0) {
      return res.status(400).json({
        success: false,
        message: 'Paid amount must be a number greater than or equal to 0',
      });
    }
  }

  if (remarks !== undefined && typeof remarks !== 'string') {
    return res.status(400).json({ success: false, message: 'Remarks must be text' });
  }

  const n = installmentNumber;
  const trimmedRemarks = typeof remarks === 'string' ? remarks.trim() : undefined;
  let statusChanged = false;
  let dueDateChanged = false;
  let amountChanged = false;

  // ---- status transitions (mutate + activity trail) ----
  if (status !== undefined && status !== installment.status) {
    statusChanged = true;

    if (status === 'paid') {
      installment.status = 'paid';
      installment.paidDate = paidDate ? new Date(paidDate) : new Date();
      installment.paidAmount = paidAmount != null ? Number(paidAmount) : installment.amount;
      plan.recordActivity({
        type: 'installment_paid',
        message: `Installment ${n} marked paid${
          paidAmount != null && installment.paidAmount !== installment.amount
            ? ` (${npr(installment.paidAmount)} of ${npr(installment.amount)})`
            : ''
        }`,
        by: req.user._id,
        byName: req.user.name,
      });
    } else if (status === 'pending') {
      // Reverting to pending clears the recorded payment
      installment.status = 'pending';
      installment.paidDate = null;
      installment.paidAmount = null;
      plan.recordActivity({
        type: 'installment_paid_reverted',
        message: `Installment ${n} reverted to pending`,
        by: req.user._id,
        byName: req.user.name,
      });
    } else {
      // 'waived' - also drop stale payment data if it had been paid before
      installment.status = 'waived';
      installment.paidDate = null;
      installment.paidAmount = null;
      plan.recordActivity({
        type: 'installment_updated',
        message: `Installment ${n} waived`,
        by: req.user._id,
        byName: req.user.name,
      });
    }
  }

  // ---- reschedule / amount changes ----
  const previousDueDate = installment.dueDate;
  const previousAmount = installment.amount;

  if (dueDate !== undefined) {
    const newDate = new Date(dueDate);
    if (newDate.getTime() !== new Date(previousDueDate).getTime()) {
      installment.dueDate = newDate;
      dueDateChanged = true;
    }
  }

  if (amount !== undefined) {
    const num = Number(amount);
    if (num !== previousAmount) {
      installment.amount = num;
      amountChanged = true;
    }
  }

  if (dueDateChanged || amountChanged) {
    const changes = [];
    if (dueDateChanged) changes.push(`due ${formatDate(previousDueDate)} → ${formatDate(new Date(dueDate))}`);
    if (amountChanged) changes.push(`amount ${npr(previousAmount)} → ${npr(installment.amount)}`);
    plan.recordActivity({
      type: 'installment_updated',
      message: dueDateChanged
        ? `Installment ${n} rescheduled: ${changes.join(', ')}`
        : `Installment ${n} amount updated: ${npr(previousAmount)} → ${npr(installment.amount)}`,
      by: req.user._id,
      byName: req.user.name,
    });
  }

  // ---- remarks (field update; trail note only when it is the sole change) ----
  if (remarks !== undefined) {
    installment.remarks = remarks;
  }
  if (!statusChanged && !dueDateChanged && !amountChanged && trimmedRemarks) {
    plan.recordActivity({
      type: 'note_added',
      message: `Note on installment ${n}: ${trimmedRemarks}`,
      by: req.user._id,
      byName: req.user.name,
    });
  }

  await plan.save();

  // ---- progress snapshot for the UI ----
  const all = plan.installments || [];
  const paidCount = all.filter((i) => i.status === 'paid').length;
  const totalCount = all.length;
  const allPaid = totalCount > 0 && all.every((i) => i.status === 'paid' || i.status === 'waived');

  await plan.populate(DETAIL_POPULATE);

  let message = 'Installment updated';
  if (statusChanged && status === 'paid') message = 'Installment marked as paid';
  else if (statusChanged && status === 'pending') message = 'Installment reverted to pending';
  else if (statusChanged && status === 'waived') message = 'Installment waived';
  else if (dueDateChanged) message = 'Installment rescheduled';
  else if (amountChanged) message = 'Installment amount updated';
  else if (trimmedRemarks) message = 'Note added to installment';

  res.json({
    success: true,
    message,
    plan,
    progress: { paidCount, totalCount, allPaid },
  });
});

/**
 * @desc    Update plan-level status / reschedule pending installments / plan note
 * @route   PATCH /api/emi-plans/:id
 * @access  Private (assigned agent or admin)
 */
const updateEmiPlan = asyncHandler(async (req, res) => {
  const { status, reschedule, remarks } = req.body;

  const plan = await EMIPlan.findById(req.params.id);
  if (!plan) {
    return res.status(404).json({ success: false, message: 'EMI plan not found' });
  }

  // Buyers are read-only even if the route guard ever changes
  if (req.user.role === 'user') {
    return res.status(403).json({ success: false, message: 'Buyers have read-only access to EMI plans' });
  }
  if (!canManage(plan, req.user)) {
    return res.status(403).json({
      success: false,
      message: 'Only the assigned agent (or an admin) can update this EMI plan.',
    });
  }

  // ---- validate everything before mutating ----
  if (status !== undefined && !PLAN_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `Invalid status. Use one of: ${PLAN_STATUSES.join(', ')}`,
    });
  }

  if (status !== undefined && status === 'completed' && status !== plan.status) {
    const unsettled = (plan.installments || []).some((i) => i.status !== 'paid' && i.status !== 'waived');
    if (unsettled) {
      return res.status(400).json({
        success: false,
        message: 'Cannot mark plan completed — not all installments are settled.',
      });
    }
  }

  let rescheduleStartDate = null;
  let rescheduleAmount = null;
  if (reschedule !== undefined && reschedule !== null) {
    if (typeof reschedule !== 'object' || Array.isArray(reschedule)) {
      return res.status(400).json({ success: false, message: 'reschedule must be an object with a startDate' });
    }
    if (!reschedule.startDate || !isParseableDate(reschedule.startDate)) {
      return res.status(400).json({
        success: false,
        message: 'reschedule.startDate is required and must be a valid date',
      });
    }
    if (plan.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Only active EMI plans can be rescheduled.' });
    }
    if (reschedule.installmentAmount !== undefined) {
      const num = Number(reschedule.installmentAmount);
      if (!Number.isFinite(num) || num <= 0) {
        return res.status(400).json({
          success: false,
          message: 'reschedule.installmentAmount must be a positive number',
        });
      }
      rescheduleAmount = num;
    }
    rescheduleStartDate = new Date(reschedule.startDate);
  }

  if (status === undefined && reschedule === undefined && remarks === undefined) {
    return res.status(400).json({ success: false, message: 'No fields provided to update' });
  }

  // ---- apply reschedule first, then status ----
  if (rescheduleStartDate) {
    const pending = (plan.installments || [])
      .filter((i) => i.status === 'pending')
      .sort((a, b) => a.installmentNumber - b.installmentNumber);

    // First remaining installment lands exactly on the new startDate, then monthly
    pending.forEach((installment, idx) => {
      installment.dueDate = addMonths(rescheduleStartDate, idx);
      if (rescheduleAmount != null) {
        installment.amount = rescheduleAmount;
      }
    });

    plan.recordActivity({
      type: 'rescheduled',
      message: `Plan rescheduled: ${pending.length} pending installment${
        pending.length === 1 ? '' : 's'
      } moved to start ${formatDate(rescheduleStartDate)}${
        rescheduleAmount != null ? ` at ${npr(rescheduleAmount)} each` : ''
      }`,
      by: req.user._id,
      byName: req.user.name,
    });
  }

  if (status !== undefined && status !== plan.status) {
    const previousStatus = plan.status;
    plan.status = status;
    plan.recordActivity({
      type: 'status_changed',
      message: `Plan status changed from ${previousStatus} to ${status} by ${req.user.name}`,
      by: req.user._id,
      byName: req.user.name,
    });
  }

  // Plan-level remarks live in the activity trail (no dedicated field on the model)
  if (typeof remarks === 'string' && remarks.trim()) {
    plan.recordActivity({
      type: 'note_added',
      message: `Plan note: ${remarks.trim()}`,
      by: req.user._id,
      byName: req.user.name,
    });
  }

  await plan.save();
  await plan.populate(DETAIL_POPULATE);

  res.json({
    success: true,
    message: 'EMI plan updated',
    plan,
  });
});

module.exports = { createEmiPlan, getEmiPlans, getEmiPlanById, updateEmiPlan, updateInstallment };
