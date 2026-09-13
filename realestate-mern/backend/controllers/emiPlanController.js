const EMIPlan = require('../models/EMIPlan');
const Sale = require('../models/Sale');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const { notify, notifyMany } = require('../utils/notify');

const PLAN_STATUSES = EMIPlan.STATUSES;
const INSTALLMENT_STATUSES = EMIPlan.INSTALLMENT_STATUSES;
const VERIFICATION_STATUSES = EMIPlan.VERIFICATION_STATUSES;

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

// Write access (create/edit installments, change plan status, reschedule,
// review verification requests): admin only. The agent manages the
// relationship but the admin's EMI Plan dashboard is the single place
// tracking + verification happens - agents get read-only visibility (see
// sanitizeForAgent below), never write access, even to their own sales.
const canManage = (plan, user) => user.role === 'admin';

const idOf = (ref) => (ref && ref._id ? ref._id : ref);

// Agents may see the schedule and status of installments for sales they
// manage, but never the money: no amounts, no paid/outstanding totals.
// Strips those fields from a plan (or array of plans) before it reaches an
// agent's response. Works on populated Mongoose docs (via .toObject/.toJSON)
// or plain objects.
const AGENT_HIDDEN_PLAN_FIELDS = ['principalAmount', 'installmentAmount', 'totalPaid', 'outstandingBalance'];
const AGENT_HIDDEN_INSTALLMENT_FIELDS = ['amount', 'paidAmount'];

const sanitizeForAgent = (planLike) => {
  const plan = typeof planLike.toObject === 'function' ? planLike.toObject({ virtuals: true }) : { ...planLike };

  AGENT_HIDDEN_PLAN_FIELDS.forEach((field) => {
    delete plan[field];
  });

  if (plan.sale && typeof plan.sale === 'object') {
    delete plan.sale.agreedPrice;
  }

  plan.installments = (plan.installments || []).map((installment) => {
    const inst = { ...installment };
    AGENT_HIDDEN_INSTALLMENT_FIELDS.forEach((field) => {
      delete inst[field];
    });
    // The buyer's requested amount is also a money figure - hide it too,
    // but keep the rest of the verification status visible (an agent should
    // still see that a verification request is pending).
    if (inst.verification) {
      const { requestedAmount, ...restVerification } = inst.verification;
      inst.verification = restVerification;
    }
    return inst;
  });

  return plan;
};

const sanitizeManyForAgent = (plans) => (plans || []).map(sanitizeForAgent);

/**
 * @desc    Create an EMI plan for a verified sale with paymentType = emi
 * @route   POST /api/emi-plans
 * @access  Private (admin)
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

  // Only the admin creates a sale's EMI plan
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Only the admin can create EMI plans.',
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

  const propertyTitle = plan.property && plan.property.title ? plan.property.title : 'your property';
  await Promise.all([
    notify({
      recipient: idOf(plan.buyer),
      type: 'emi_plan_created',
      title: 'Your EMI plan is ready',
      message: `An EMI schedule of ${tenure} installments of ${npr(perInstallment)} for "${propertyTitle}" starting ${formatDate(start)} has been set up.`,
      emiPlan: plan._id,
      property: idOf(plan.property),
      link: '/my-emi',
    }),
    notify({
      recipient: idOf(plan.agent),
      type: 'emi_plan_created',
      title: 'EMI plan initialized',
      message: `An EMI schedule (${tenure} installments) was set up for "${propertyTitle}".`,
      emiPlan: plan._id,
      property: idOf(plan.property),
      link: '/dashboard/agent/emi-sales',
    }),
  ]);

  res.status(201).json({
    success: true,
    message: 'EMI plan created',
    plan,
  });
});

/**
 * @desc    Verified EMI sales that do not have an EMI plan yet - the data
 *          source for the admin's "Initialize EMI Plan" picker. A sale is
 *          eligible when it is verified, paid via EMI, linked to a registered
 *          buyer account and has no plan attached.
 * @route   GET /api/emi-plans/eligible-sales
 * @access  Private (admin)
 */
const getEligibleEmiSales = asyncHandler(async (req, res) => {
  const { search, limit = 50 } = req.query;

  // Any sale with a plan (even cancelled/defaulted) is excluded - the plan
  // record still exists and createEmiPlan rejects duplicates with 409.
  const plannedSaleIds = await EMIPlan.distinct('sale');

  const sales = await Sale.find({
    status: 'verified',
    paymentType: 'emi',
    _id: { $nin: plannedSaleIds },
    // Plans must attach to a registered buyer platform account
    'buyer.user': { $ne: null },
  })
    .populate({ path: 'property', select: 'title slug' })
    .populate({ path: 'agent', select: 'name email' })
    .populate({ path: 'buyer.user', select: 'name email' })
    .sort({ reviewedAt: -1, createdAt: -1 })
    .lean();

  const mapped = sales.map((sale) => ({
    _id: sale._id,
    property: sale.property ? { _id: sale.property._id, title: sale.property.title } : null,
    buyer: {
      name: (sale.buyer && sale.buyer.name) || '',
      email: (sale.buyer && sale.buyer.email) || '',
      user: sale.buyer && sale.buyer.user
        ? {
            _id: sale.buyer.user._id,
            name: sale.buyer.user.name,
            email: sale.buyer.user.email,
          }
        : null,
    },
    agent: sale.agent ? { _id: sale.agent._id, name: sale.agent.name } : null,
    agreedPrice: sale.agreedPrice,
    downPaymentAmount: sale.downPaymentAmount,
    reviewedAt: sale.reviewedAt,
  }));

  // Optional search on property title / buyer / agent. The eligible pool is
  // small, so an in-memory filter keeps the query simple.
  const term = typeof search === 'string' ? search.trim().toLowerCase() : '';
  const filtered = term
    ? mapped.filter((sale) => {
        const haystack = [
          sale.property && sale.property.title,
          sale.buyer && sale.buyer.name,
          sale.buyer && sale.buyer.email,
          sale.agent && sale.agent.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      })
    : mapped;

  const maxLimit = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);

  res.json({
    success: true,
    count: filtered.length,
    sales: filtered.slice(0, maxLimit),
  });
});

/**
 * @desc    List EMI plans with filters + dashboard summary
 * @route   GET /api/emi-plans
 * @access  Private (admin sees all, agent sees own)
 */
const getEmiPlans = asyncHandler(async (req, res) => {
  const { status, overdue, dueThisMonth, agent, buyer, sale, page = 1, limit = 10 } = req.query;

  const query = {};
  const summaryScope = {};
  const isAgentRequester = req.user.role === 'agent';

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
    // Narrow to a single sale - used by the admin UI to check whether a plan
    // already exists for a sale before opening the initialize form.
    if (sale) {
      query.sale = sale;
    }
  } else if (isAgentRequester) {
    // Agents only ever see plans they manage (read-only, amounts stripped below)
    query.agent = req.user._id;
    summaryScope.agent = req.user._id;
  } else {
    // Buyers only ever see their own plans
    query.buyer = req.user._id;
    summaryScope.buyer = req.user._id;
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
          pendingVerifications: [
            { $unwind: '$installments' },
            { $match: { 'installments.verification.status': 'pending' } },
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

  const summary = {
    activePlans: facetCount(facets.activePlans),
    dueThisMonth: facetCount(facets.dueThisMonth),
    overdueInstallments: facetCount(facets.overdueInstallments),
    totalOutstanding: facets.totalOutstanding && facets.totalOutstanding[0] ? facets.totalOutstanding[0].total : 0,
  };
  // Admin-only queue counter - not meaningful to agents/buyers
  if (req.user.role === 'admin') {
    summary.pendingVerifications = facetCount(facets.pendingVerifications);
  }

  // Agents get schedule + status only - never the money
  if (isAgentRequester) {
    delete summary.totalOutstanding;
  }

  res.json({
    success: true,
    count: plans.length,
    pagination: {
      total,
      pages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      limit: limitNum,
    },
    summary,
    plans: isAgentRequester ? sanitizeManyForAgent(plans) : plans,
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
    plan: isAgent ? sanitizeForAgent(plan) : plan,
    // Helps the UI hide write controls - only the admin can manage a plan
    // (agents and buyers get read-only visibility, see sanitizeForAgent for
    // what's additionally stripped from an agent's view).
    canManage: isAdmin,
  });
});

/**
 * @desc    Update a single installment (mark paid/pending/waived, reschedule, notes)
 * @route   PATCH /api/emi-plans/:id/installments/:n
 * @access  Private (admin only)
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
      message: 'Only an admin can update this EMI plan.',
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
      // If the buyer had an outstanding verification request on this
      // installment, marking it paid (whether the admin got there via the
      // request or independently) resolves that request too.
      if (installment.verification && installment.verification.status === 'pending') {
        installment.verification.status = 'approved';
        installment.verification.reviewedBy = req.user._id;
        installment.verification.reviewedAt = new Date();
        if (!installment.verification.reviewNote) {
          installment.verification.reviewNote = 'Confirmed when the installment was marked paid.';
        }
      }
    } else if (status === 'pending') {
      // Reverting to pending clears the recorded payment
      installment.status = 'pending';
      installment.paidDate = null;
      installment.paidAmount = null;
      // Start the verification slate clean too, so the buyer can submit again
      if (installment.verification && installment.verification.status !== 'none') {
        installment.verification.status = 'none';
        installment.verification.requestedAmount = null;
        installment.verification.requestedDate = null;
        installment.verification.paymentSlipUrl = '';
        installment.verification.note = '';
        installment.verification.submittedAt = null;
        installment.verification.reviewedBy = null;
        installment.verification.reviewedAt = null;
        installment.verification.reviewNote = '';
      }
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
      if (installment.verification && installment.verification.status === 'pending') {
        installment.verification.status = 'none';
      }
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

  // ---- notification alerts ----
  // Buyer sees amounts (it's their money); the agent's copy never includes one.
  const propertyId = idOf(plan.property);
  const notifyTasks = [];

  if (statusChanged) {
    const buyerCopy = {
      paid: `Installment ${n} of ${npr(installment.paidAmount)} was marked as paid.`,
      pending: `Installment ${n} was reverted to pending.`,
      waived: `Installment ${n} was waived.`,
    };
    const agentCopy = {
      paid: `Installment ${n} was marked as paid.`,
      pending: `Installment ${n} was reverted to pending.`,
      waived: `Installment ${n} was waived.`,
    };
    notifyTasks.push(
      notify({
        recipient: idOf(plan.buyer),
        type: 'emi_installment_updated',
        title: 'Your EMI installment was updated',
        message: buyerCopy[status] || `Installment ${n} was updated.`,
        emiPlan: plan._id,
        property: propertyId,
        link: '/my-emi',
      }),
      notify({
        recipient: idOf(plan.agent),
        type: 'emi_installment_updated',
        title: 'EMI installment updated',
        message: agentCopy[status] || `Installment ${n} was updated.`,
        emiPlan: plan._id,
        property: propertyId,
        link: '/dashboard/agent/emi-sales',
      })
    );
  } else if (dueDateChanged) {
    const dueText = `Installment ${n} due date moved to ${formatDate(installment.dueDate)}.`;
    notifyTasks.push(
      notify({
        recipient: idOf(plan.buyer),
        type: 'emi_installment_updated',
        title: 'Your EMI installment was rescheduled',
        message: dueText,
        emiPlan: plan._id,
        property: propertyId,
        link: '/my-emi',
      }),
      notify({
        recipient: idOf(plan.agent),
        type: 'emi_installment_updated',
        title: 'EMI installment rescheduled',
        message: dueText,
        emiPlan: plan._id,
        property: propertyId,
        link: '/dashboard/agent/emi-sales',
      })
    );
  } else if (amountChanged) {
    // Amount-only change - buyer only, agents never see amounts
    notifyTasks.push(
      notify({
        recipient: idOf(plan.buyer),
        type: 'emi_installment_updated',
        title: 'Your EMI installment amount changed',
        message: `Installment ${n} amount updated to ${npr(installment.amount)}.`,
        emiPlan: plan._id,
        property: propertyId,
        link: '/my-emi',
      })
    );
  }

  await Promise.all(notifyTasks);

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
 * @access  Private (admin only)
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
      message: 'Only an admin can update this EMI plan.',
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

  let planStatusChanged = false;
  let previousStatus = plan.status;
  if (status !== undefined && status !== plan.status) {
    planStatusChanged = true;
    previousStatus = plan.status;
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

  // ---- notification alerts ----
  const propertyId = idOf(plan.property);
  const notifyTasks = [];

  if (rescheduleStartDate) {
    const scheduleText = `Your remaining installments were rescheduled starting ${formatDate(rescheduleStartDate)}.`;
    notifyTasks.push(
      notify({
        recipient: idOf(plan.buyer),
        type: 'emi_installment_updated',
        title: 'Your EMI schedule was updated',
        message: scheduleText,
        emiPlan: plan._id,
        property: propertyId,
        link: '/my-emi',
      }),
      notify({
        recipient: idOf(plan.agent),
        type: 'emi_installment_updated',
        title: 'EMI schedule rescheduled',
        message: `Remaining installments were rescheduled starting ${formatDate(rescheduleStartDate)}.`,
        emiPlan: plan._id,
        property: propertyId,
        link: '/dashboard/agent/emi-sales',
      })
    );
  }

  if (planStatusChanged) {
    notifyTasks.push(
      notify({
        recipient: idOf(plan.buyer),
        type: 'emi_plan_status_changed',
        title: 'Your EMI plan status changed',
        message: `Your EMI plan status changed from ${previousStatus} to ${status}.`,
        emiPlan: plan._id,
        property: propertyId,
        link: '/my-emi',
      }),
      notify({
        recipient: idOf(plan.agent),
        type: 'emi_plan_status_changed',
        title: 'EMI plan status changed',
        message: `EMI plan status changed from ${previousStatus} to ${status}.`,
        emiPlan: plan._id,
        property: propertyId,
        link: '/dashboard/agent/emi-sales',
      })
    );
  }

  await Promise.all(notifyTasks);

  res.json({
    success: true,
    message: 'EMI plan updated',
    plan,
  });
});

/**
 * @desc    Buyer submits proof of payment for one of their installments,
 *          optionally attaching a photo of the payment slip. This only
 *          raises a request for the admin to review - it never marks the
 *          installment paid by itself.
 * @route   POST /api/emi-plans/:id/installments/:n/verification-request
 * @access  Private (the plan's linked buyer only)
 */
const requestInstallmentVerification = asyncHandler(async (req, res) => {
  const { paidAmount, paidDate, note } = req.body;

  const installmentNumber = parseInt(req.params.n, 10);
  if (!Number.isInteger(installmentNumber) || installmentNumber < 1) {
    return res.status(400).json({ success: false, message: 'Invalid installment number' });
  }

  const plan = await EMIPlan.findById(req.params.id);
  if (!plan) {
    return res.status(404).json({ success: false, message: 'EMI plan not found' });
  }

  const buyerId = idOf(plan.buyer);
  if (!buyerId || String(buyerId) !== String(req.user._id)) {
    return res.status(403).json({
      success: false,
      message: 'Only the buyer this EMI plan is linked to can request payment verification.',
    });
  }

  const installment = plan.installments.find((i) => i.installmentNumber === installmentNumber);
  if (!installment) {
    return res.status(404).json({ success: false, message: 'Installment not found' });
  }

  if (installment.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: `This installment is already ${installment.status} - nothing to verify.`,
    });
  }

  if (installment.verification && installment.verification.status === 'pending') {
    return res.status(409).json({
      success: false,
      message: 'A verification request for this installment is already pending review.',
    });
  }

  let requestedAmount = installment.amount;
  if (paidAmount !== undefined && paidAmount !== null && paidAmount !== '') {
    const num = Number(paidAmount);
    if (!Number.isFinite(num) || num < 0) {
      return res.status(400).json({ success: false, message: 'Paid amount must be a number greater than or equal to 0' });
    }
    requestedAmount = num;
  }

  let requestedDate = new Date();
  if (paidDate !== undefined && paidDate !== null && paidDate !== '') {
    if (!isParseableDate(paidDate)) {
      return res.status(400).json({ success: false, message: 'Paid date is not a valid date' });
    }
    requestedDate = new Date(paidDate);
  }

  const paymentSlipUrl = req.file ? req.file.path : '';
  const trimmedNote = typeof note === 'string' ? note.trim() : '';

  installment.verification = {
    status: 'pending',
    requestedAmount,
    requestedDate,
    paymentSlipUrl,
    note: trimmedNote,
    submittedAt: new Date(),
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: '',
  };

  plan.recordActivity({
    type: 'verification_requested',
    message: `Buyer submitted payment verification for installment ${installmentNumber} (${npr(requestedAmount)}, ${formatDate(requestedDate)})${paymentSlipUrl ? ' with a payment slip' : ''}`,
    by: req.user._id,
    byName: req.user.name,
  });

  await plan.save();
  await plan.populate(DETAIL_POPULATE);

  const propertyTitle = plan.property && plan.property.title ? plan.property.title : 'your property';
  const propertyId = idOf(plan.property);

  // Alert every admin - this is the verification queue they work from - plus
  // the managing agent (schedule/status only, no amount in their copy).
  const admins = await User.find({ role: 'admin' }).select('_id');
  await Promise.all([
    notifyMany(
      admins.map((a) => a._id),
      {
        type: 'emi_verification_requested',
        title: 'EMI payment verification requested',
        message: `${req.user.name} submitted payment proof for installment ${installmentNumber} of "${propertyTitle}" (${npr(requestedAmount)}).`,
        emiPlan: plan._id,
        property: propertyId,
        link: `/dashboard/admin/emi-plans/${plan._id}`,
      }
    ),
    notify({
      recipient: idOf(plan.agent),
      type: 'emi_verification_requested',
      title: 'Buyer submitted payment verification',
      message: `The buyer submitted payment verification for installment ${installmentNumber} of "${propertyTitle}", pending admin review.`,
      emiPlan: plan._id,
      property: propertyId,
      link: '/dashboard/agent/emi-sales',
    }),
  ]);

  res.status(201).json({
    success: true,
    message: 'Payment verification request submitted. You will be notified once it is reviewed.',
    plan,
  });
});

/**
 * @desc    Admin approves or rejects a buyer's payment verification request.
 *          Approving marks the installment paid using the buyer's submitted
 *          (or admin-overridden) amount/date; rejecting leaves it pending
 *          with a reason the buyer can see.
 * @route   PATCH /api/emi-plans/:id/installments/:n/verification-request
 * @access  Private (admin)
 */
const reviewInstallmentVerification = asyncHandler(async (req, res) => {
  const { action, reviewNote, paidAmount, paidDate } = req.body;

  const installmentNumber = parseInt(req.params.n, 10);
  if (!Number.isInteger(installmentNumber) || installmentNumber < 1) {
    return res.status(400).json({ success: false, message: 'Invalid installment number' });
  }

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ success: false, message: "Action must be 'approve' or 'reject'" });
  }

  const plan = await EMIPlan.findById(req.params.id);
  if (!plan) {
    return res.status(404).json({ success: false, message: 'EMI plan not found' });
  }

  const installment = plan.installments.find((i) => i.installmentNumber === installmentNumber);
  if (!installment) {
    return res.status(404).json({ success: false, message: 'Installment not found' });
  }

  if (!installment.verification || installment.verification.status !== 'pending') {
    return res.status(400).json({
      success: false,
      message: 'This installment has no pending verification request to review.',
    });
  }

  const trimmedReviewNote = typeof reviewNote === 'string' ? reviewNote.trim() : '';

  if (action === 'reject') {
    if (!trimmedReviewNote) {
      return res.status(400).json({ success: false, message: 'A reason is required to reject a verification request.' });
    }
    installment.verification.status = 'rejected';
    installment.verification.reviewedBy = req.user._id;
    installment.verification.reviewedAt = new Date();
    installment.verification.reviewNote = trimmedReviewNote;

    plan.recordActivity({
      type: 'verification_rejected',
      message: `Payment verification for installment ${installmentNumber} rejected: ${trimmedReviewNote}`,
      by: req.user._id,
      byName: req.user.name,
    });
  } else {
    // approve - admin may override the buyer's submitted figures
    let finalAmount = installment.verification.requestedAmount != null ? installment.verification.requestedAmount : installment.amount;
    if (paidAmount !== undefined && paidAmount !== null && paidAmount !== '') {
      const num = Number(paidAmount);
      if (!Number.isFinite(num) || num < 0) {
        return res.status(400).json({ success: false, message: 'Paid amount must be a number greater than or equal to 0' });
      }
      finalAmount = num;
    }

    let finalDate = installment.verification.requestedDate || new Date();
    if (paidDate !== undefined && paidDate !== null && paidDate !== '') {
      if (!isParseableDate(paidDate)) {
        return res.status(400).json({ success: false, message: 'Paid date is not a valid date' });
      }
      finalDate = new Date(paidDate);
    }

    installment.status = 'paid';
    installment.paidAmount = finalAmount;
    installment.paidDate = finalDate;

    installment.verification.status = 'approved';
    installment.verification.reviewedBy = req.user._id;
    installment.verification.reviewedAt = new Date();
    installment.verification.reviewNote = trimmedReviewNote;

    plan.recordActivity({
      type: 'verification_approved',
      message: `Payment verification for installment ${installmentNumber} approved - marked paid (${npr(finalAmount)})`,
      by: req.user._id,
      byName: req.user.name,
    });
  }

  await plan.save();
  await plan.populate(DETAIL_POPULATE);

  const propertyId = idOf(plan.property);
  const propertyTitle = plan.property && plan.property.title ? plan.property.title : 'your property';

  await Promise.all([
    notify({
      recipient: idOf(plan.buyer),
      type: action === 'approve' ? 'emi_verification_approved' : 'emi_verification_rejected',
      title: action === 'approve' ? 'Payment verified' : 'Payment verification rejected',
      message:
        action === 'approve'
          ? `Your payment for installment ${installmentNumber} of "${propertyTitle}" was verified and marked paid.`
          : `Your payment verification for installment ${installmentNumber} of "${propertyTitle}" was rejected: ${trimmedReviewNote}`,
      emiPlan: plan._id,
      property: propertyId,
      link: '/my-emi',
    }),
    notify({
      recipient: idOf(plan.agent),
      type: action === 'approve' ? 'emi_verification_approved' : 'emi_verification_rejected',
      title: action === 'approve' ? 'EMI payment verified' : 'EMI payment verification rejected',
      message:
        action === 'approve'
          ? `Installment ${installmentNumber} of "${propertyTitle}" was verified and marked paid.`
          : `Installment ${installmentNumber} of "${propertyTitle}" payment verification was rejected.`,
      emiPlan: plan._id,
      property: propertyId,
      link: '/dashboard/agent/emi-sales',
    }),
  ]);

  res.json({
    success: true,
    message: action === 'approve' ? 'Payment verified and installment marked paid' : 'Verification request rejected',
    plan,
  });
});

module.exports = {
  createEmiPlan,
  getEligibleEmiSales,
  getEmiPlans,
  getEmiPlanById,
  updateEmiPlan,
  updateInstallment,
  requestInstallmentVerification,
  reviewInstallmentVerification,
};
