/**
 * Agent management controller (Spec v2 - Phase 4)
 *
 * Full CRUD over User docs with role='agent'. Role changes are deliberately
 * NOT handled here - promotion/demotion stays on /api/users; this controller
 * manages the agency's agent roster (profile, status, password reset).
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Sale = require('../models/Sale');
const CommissionRecord = require('../models/CommissionRecord');
const EMIPlan = require('../models/EMIPlan');
const asyncHandler = require('../utils/asyncHandler');

// ---------- helpers ----------

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const EMPTY_PERF = { salesCount: 0, salesValue: 0, commissionEarned: 0, commissionPaid: 0 };

// One aggregate per source for the whole batch - grouped by agent, then merged
// in JS. CommissionRecord: commissionEarned (all) + paidSum (settled only).
// Sale: verified only -> salesCount + salesValue (agreedPrice).
const buildPerformanceForAgents = async (agentIds) => {
  const ids = (agentIds || []).map((id) => new mongoose.Types.ObjectId(String(id)));
  const map = new Map();
  if (ids.length === 0) return map;

  const [commissionAgg, saleAgg] = await Promise.all([
    CommissionRecord.aggregate([
      { $match: { agent: { $in: ids } } },
      {
        $group: {
          _id: '$agent',
          commissionEarned: { $sum: '$commissionAmount' },
          paidSum: { $sum: { $cond: [{ $eq: ['$isPaid', true] }, '$commissionAmount', 0] } },
        },
      },
    ]),
    Sale.aggregate([
      { $match: { agent: { $in: ids }, status: 'verified' } },
      { $group: { _id: '$agent', salesCount: { $sum: 1 }, salesValue: { $sum: '$agreedPrice' } } },
    ]),
  ]);

  commissionAgg.forEach((row) => {
    const key = String(row._id);
    const existing = map.get(key) || EMPTY_PERF;
    map.set(key, { ...existing, commissionEarned: round2(row.commissionEarned), commissionPaid: round2(row.paidSum) });
  });
  saleAgg.forEach((row) => {
    const key = String(row._id);
    const existing = map.get(key) || EMPTY_PERF;
    map.set(key, { ...existing, salesCount: row.salesCount, salesValue: round2(row.salesValue) });
  });
  return map;
};

const performanceFor = (map, id) => ({ ...EMPTY_PERF, ...(map.get(String(id)) || {}) });

// 404 for both "no such user" and "user exists but is not an agent" so the
// endpoint never leaks non-agent accounts.
const findAgentOr404 = async (id, res) => {
  const user = await User.findById(id);
  if (!user || user.role !== 'agent') {
    res.status(404).json({ success: false, message: 'Agent not found' });
    return null;
  }
  return user;
};

const parseJoinedAt = (value) => {
  if (value === null || value === '') return { ok: true, date: null };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { ok: false };
  return { ok: true, date: d };
};

// Mirrors emiPlanController's outstanding computation (virtual parity):
// principalAmount - sum(paidAmount ?? amount of paid installments), floored at 0.
const PAID_EXPRESSION = {
  $sum: {
    $map: {
      input: { $filter: { input: '$installments', cond: { $eq: ['$$this.status', 'paid'] } } },
      in: { $ifNull: ['$$this.paidAmount', '$$this.amount'] },
    },
  },
};

/**
 * @desc    List agents with search + pagination + per-agent performance stats
 * @route   GET /api/agents
 * @access  Private (admin)
 */
const getAgents = asyncHandler(async (req, res) => {
  const { search, sort } = req.query;
  const query = { role: 'agent' };
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 10), 100);
  const skip = (page - 1) * limit;

  const dbSortMap = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    name_asc: { name: 1 },
  };

  let total;
  let agentsPage;

  if (sort === 'top_performer') {
    // Ranking by commission earned can't happen in the DB (it lives in
    // CommissionRecords, not on the User), so fetch ALL matching agents
    // first, compute stats for every one of them, rank, then paginate.
    const allAgents = await User.find(query).sort({ createdAt: -1 });
    const perfMap = await buildPerformanceForAgents(allAgents.map((a) => a._id));
    const allWithStats = allAgents.map((user) => ({
      ...user.toSafeObject(),
      performance: performanceFor(perfMap, user._id),
    }));
    allWithStats.sort(
      (a, b) => (b.performance.commissionEarned || 0) - (a.performance.commissionEarned || 0)
    );
    total = allWithStats.length;
    agentsPage = allWithStats.slice(skip, skip + limit);
  } else {
    const [agents, totalFound] = await Promise.all([
      User.find(query).sort(dbSortMap[sort] || dbSortMap.newest).skip(skip).limit(limit),
      User.countDocuments(query),
    ]);
    total = totalFound;

    const perfMap = await buildPerformanceForAgents(agents.map((a) => a._id));
    agentsPage = agents.map((user) => ({
      ...user.toSafeObject(),
      performance: performanceFor(perfMap, user._id),
    }));
  }

  res.json({
    success: true,
    count: agentsPage.length,
    agents: agentsPage,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

/**
 * @desc    Create an agent account (admin-created agents can log in at once)
 * @route   POST /api/agents
 * @access  Private (admin)
 */
const createAgent = asyncHandler(async (req, res) => {
  const { name, email, password, phone, licenseNumber, employeeId, joinedAt } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email and password are required' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(409).json({ success: false, message: 'A user with this email already exists' });
  }

  const user = new User({
    name,
    email: normalizedEmail,
    password,
    phone: phone || '',
    role: 'agent',
    // Admin-created agents skip the email-verification gate
    isEmailVerified: true,
  });

  if (licenseNumber !== undefined) user.agentProfile.licenseNumber = licenseNumber;
  if (employeeId !== undefined) user.agentProfile.employeeId = employeeId;
  if (joinedAt !== undefined) {
    const parsed = parseJoinedAt(joinedAt);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, message: 'Invalid joinedAt date' });
    }
    user.agentProfile.joinedAt = parsed.date;
  }

  try {
    await user.save(); // pre-save hook hashes the password
  } catch (err) {
    // Duplicate-email race with the findOne check above
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    }
    throw err;
  }

  res.status(201).json({ success: true, agent: user.toSafeObject() });
});

/**
 * @desc    Get a single agent (with performance stats)
 * @route   GET /api/agents/:id
 * @access  Private (admin)
 */
const getAgent = asyncHandler(async (req, res) => {
  const user = await findAgentOr404(req.params.id, res);
  if (!user) return;

  const perfMap = await buildPerformanceForAgents([user._id]);
  res.json({
    success: true,
    agent: { ...user.toSafeObject(), performance: performanceFor(perfMap, user._id) },
  });
});

/**
 * @desc    Drill-down summary for the ManageAgents page (sales/commissions/EMI)
 * @route   GET /api/agents/:id/summary
 * @access  Private (admin)
 */
const getAgentSummary = asyncHandler(async (req, res) => {
  const user = await findAgentOr404(req.params.id, res);
  if (!user) return;

  const agentId = user._id;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [salesAgg, commissionAgg, emiStatusAgg, overdueAgg, outstandingAgg] = await Promise.all([
    Sale.aggregate([
      { $match: { agent: agentId } },
      { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: '$agreedPrice' } } },
    ]),
    CommissionRecord.aggregate([
      { $match: { agent: agentId } },
      { $group: { _id: '$isPaid', count: { $sum: 1 }, amount: { $sum: '$commissionAmount' } } },
    ]),
    EMIPlan.aggregate([
      { $match: { agent: agentId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    EMIPlan.aggregate([
      { $match: { agent: agentId } },
      { $unwind: '$installments' },
      { $match: { 'installments.status': 'pending', 'installments.dueDate': { $lt: today } } },
      { $count: 'count' },
    ]),
    // Outstanding over the agent's ACTIVE plans only (mirrors admin emiPortfolio)
    EMIPlan.aggregate([
      { $match: { agent: agentId, status: 'active' } },
      { $project: { paid: PAID_EXPRESSION, principal: '$principalAmount' } },
      { $project: { outstanding: { $max: [{ $subtract: ['$principal', '$paid'] }, 0] } } },
      { $group: { _id: null, total: { $sum: '$outstanding' } } },
    ]),
  ]);

  // --- sales ---
  const salesByStatus = { pending_review: 0, verified: 0, rejected: 0 };
  let totalSales = 0;
  let totalValue = 0;
  salesAgg.forEach(({ _id, count, value }) => {
    totalSales += count;
    if (salesByStatus[_id] !== undefined) salesByStatus[_id] = count;
    if (_id === 'verified') totalValue = round2(value);
  });

  // --- commissions ---
  let paidCount = 0;
  let pendingCount = 0;
  let paidAmount = 0;
  let pendingAmount = 0;
  commissionAgg.forEach(({ _id, count, amount }) => {
    if (_id === true) {
      paidCount = count;
      paidAmount = round2(amount);
    } else if (_id === false) {
      pendingCount = count;
      pendingAmount = round2(amount);
    }
  });

  // --- EMI ---
  const emiByStatus = {};
  emiStatusAgg.forEach(({ _id, count }) => {
    if (_id) emiByStatus[_id] = count;
  });

  res.json({
    success: true,
    summary: {
      sales: {
        total: totalSales,
        verified: salesByStatus.verified,
        pending: salesByStatus.pending_review,
        rejected: salesByStatus.rejected,
        totalValue,
      },
      commissions: {
        total: paidCount + pendingCount,
        paid: paidCount,
        pending: pendingCount,
        paidAmount,
        pendingAmount,
      },
      emi: {
        activePlans: emiByStatus.active || 0,
        overdueInstallments: (overdueAgg[0] && overdueAgg[0].count) || 0,
        totalOutstanding: outstandingAgg[0] ? round2(outstandingAgg[0].total) : 0,
      },
    },
  });
});

/**
 * @desc    Update an agent (profile fields, active flag, optional password reset).
 *          Role changes are ignored here on purpose - use /api/users for those.
 * @route   PUT /api/agents/:id  |  PATCH /api/agents/:id
 * @access  Private (admin)
 */
const updateAgent = asyncHandler(async (req, res) => {
  const user = await findAgentOr404(req.params.id, res);
  if (!user) return;

  const { name, phone, isActive, password, agentProfile } = req.body;

  if (password !== undefined && password !== null && password !== '') {
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    user.password = password; // pre-save hook hashes it
  }

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (typeof isActive === 'boolean') user.isActive = isActive;
  else if (isActive === 'true') user.isActive = true;
  else if (isActive === 'false') user.isActive = false;

  if (agentProfile && typeof agentProfile === 'object') {
    const { licenseNumber, employeeId, joinedAt } = agentProfile;
    if (licenseNumber !== undefined) user.agentProfile.licenseNumber = licenseNumber;
    if (employeeId !== undefined) user.agentProfile.employeeId = employeeId;
    if (joinedAt !== undefined) {
      const parsed = parseJoinedAt(joinedAt);
      if (!parsed.ok) {
        return res.status(400).json({ success: false, message: 'Invalid joinedAt date' });
      }
      user.agentProfile.joinedAt = parsed.date;
    }
  }

  // req.body.role / req.body.email are intentionally ignored

  await user.save();
  res.json({ success: true, agent: user.toSafeObject() });
});

/**
 * @desc    Activate / deactivate an agent account
 * @route   PATCH /api/agents/:id/status
 * @access  Private (admin)
 */
const toggleAgentStatus = asyncHandler(async (req, res) => {
  const user = await findAgentOr404(req.params.id, res);
  if (!user) return;

  if (String(req.user._id) === String(user._id)) {
    return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
  }

  user.isActive = !user.isActive;
  await user.save();
  res.json({ success: true, agent: user.toSafeObject() });
});

/**
 * @desc    Delete an agent account
 * @route   DELETE /api/agents/:id
 * @access  Private (admin)
 */
const deleteAgent = asyncHandler(async (req, res) => {
  const user = await findAgentOr404(req.params.id, res);
  if (!user) return;

  await user.deleteOne();
  res.json({ success: true, message: 'Agent removed successfully' });
});

module.exports = {
  getAgents,
  createAgent,
  getAgent,
  getAgentSummary,
  updateAgent,
  toggleAgentStatus,
  deleteAgent,
};
