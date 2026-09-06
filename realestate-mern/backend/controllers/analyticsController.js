/**
 * Analytics controller (Spec v2 - Feature 4)
 *
 * Three HTTP handlers wrap two internal report builders so the JSON endpoints
 * and the CSV/PDF export reuse the exact same dataset:
 *
 *   buildAdminAnalytics()   - platform-wide numbers
 *   buildAgentAnalytics(id) - one agent's numbers
 *
 * Monthly series are built as: aggregation ($year/$month on the date field)
 * -> JS fill of the last 12 month keys ('YYYY-MM', UTC - matching how MongoDB
 * $year/$month bucket dates).
 */

const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const CommissionRecord = require('../models/CommissionRecord');
const EMIPlan = require('../models/EMIPlan');
const Lead = require('../models/Lead');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const reportGenerator = require('../utils/reportGenerator');

// ---------- shared helpers ----------

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Last `count` month keys (oldest first), e.g. '2024-06' .. '2025-05'.
// UTC on purpose - MongoDB's $year/$month operators bucket in UTC.
const buildMonthKeys = (count = 12) => {
  const keys = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
};

const monthStartUtc = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
};

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

// Agg rows grouped by { y, m } -> map keyed 'YYYY-MM'
const toMonthValueMap = (rows) => {
  const map = new Map();
  (rows || []).forEach((r) => {
    if (!r || !r._id || r._id.y == null || r._id.m == null) return;
    map.set(`${r._id.y}-${String(r._id.m).padStart(2, '0')}`, r);
  });
  return map;
};

// Grouped-by-year/month aggregation over `dateField` restricted to the window
const monthlyGroupStages = (dateField, extraMatch, windowStart) => [
  { $match: { ...extraMatch, [dateField]: { $ne: null, $gte: windowStart } } },
  {
    $group: {
      _id: { y: { $year: `$${dateField}` }, m: { $month: `$${dateField}` } },
      count: { $sum: 1 },
      value: { $sum: '$agreedPrice' },
      amount: { $sum: '$commissionAmount' },
    },
  },
  { $sort: { '_id.y': 1, '_id.m': 1 } },
];

const toMonthlySalesSeries = (monthKeys, rows) => {
  const map = toMonthValueMap(rows);
  return monthKeys.map((month) => {
    const row = map.get(month);
    return { month, count: (row && row.count) || 0, value: round2(row && row.value) };
  });
};

const toMonthlyCommissionSeries = (monthKeys, earnedRows, paidRows) => {
  const earned = toMonthValueMap(earnedRows);
  const paid = toMonthValueMap(paidRows);
  return monthKeys.map((month) => ({
    month,
    earned: round2(earned.get(month) && earned.get(month).amount),
    paid: round2(paid.get(month) && paid.get(month).amount),
  }));
};

// EMI portfolio (optionally scoped) - mirrors the emiPlanController summary:
// outstanding = principal - sum(paidAmount ?? amount of PAID installments),
// floored at 0, summed over ACTIVE plans only.
const PAID_EXPRESSION = {
  $sum: {
    $map: {
      input: { $filter: { input: '$installments', cond: { $eq: ['$$this.status', 'paid'] } } },
      in: { $ifNull: ['$$this.paidAmount', '$$this.amount'] },
    },
  },
};

const buildEmiPortfolio = async (baseMatch = {}) => {
  const today = startOfToday();
  const stages = [];
  if (Object.keys(baseMatch).length > 0) stages.push({ $match: baseMatch });

  const [facets] = await EMIPlan.aggregate([
    ...stages,
    {
      $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        overdueInstallments: [
          { $unwind: '$installments' },
          { $match: { 'installments.status': 'pending', 'installments.dueDate': { $lt: today } } },
          { $count: 'count' },
        ],
        totalOutstanding: [
          { $match: { status: 'active' } },
          { $project: { paid: PAID_EXPRESSION, principal: '$principalAmount' } },
          { $project: { outstanding: { $max: [{ $subtract: ['$principal', '$paid'] }, 0] } } },
          { $group: { _id: null, total: { $sum: '$outstanding' } } },
        ],
      },
    },
  ]);

  const byStatus = {};
  ((facets && facets.byStatus) || []).forEach(({ _id, count }) => {
    if (_id) byStatus[_id] = count;
  });
  const facetCount = (rows) => (rows && rows[0] && rows[0].count) || 0;

  return {
    activePlans: byStatus.active || 0,
    completedPlans: byStatus.completed || 0,
    defaultedPlans: byStatus.defaulted || 0,
    overdueInstallments: facetCount(facets && facets.overdueInstallments),
    totalOutstanding: facets && facets.totalOutstanding[0] ? round2(facets.totalOutstanding[0].total) : 0,
  };
};

// ---------- internal report builders (shared by JSON + export handlers) ----------

const buildAdminAnalytics = async () => {
  const monthKeys = buildMonthKeys(12);
  const windowStart = monthStartUtc(monthKeys[0]);

  const [
    salesOverTimeAgg,
    commissionTotalsAgg,
    earnedOverTimeAgg,
    paidOverTimeAgg,
    emiPortfolio,
    salesByAgentAgg,
    commissionByAgentAgg,
    leadStageAgg,
    pendingSaleVerifications,
  ] = await Promise.all([
    // Verified sales per month (reviewedAt = verification date)
    Sale.aggregate(monthlyGroupStages('reviewedAt', { status: 'verified' }, windowStart)),
    // Lifetime commission totals
    CommissionRecord.aggregate([
      {
        $group: {
          _id: null,
          earnedTotal: { $sum: '$commissionAmount' },
          paidAmount: { $sum: { $cond: [{ $eq: ['$isPaid', true] }, '$commissionAmount', 0] } },
          pendingAmount: { $sum: { $cond: [{ $eq: ['$isPaid', false] }, '$commissionAmount', 0] } },
          paidCount: { $sum: { $cond: [{ $eq: ['$isPaid', true] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ['$isPaid', false] }, 1, 0] } },
        },
      },
    ]),
    // Earned per month (createdAt = verification/earning date)
    CommissionRecord.aggregate(monthlyGroupStages('createdAt', {}, windowStart)),
    // Paid per month (paidAt, settled records only)
    CommissionRecord.aggregate(
      monthlyGroupStages('paidAt', { isPaid: true }, windowStart)
    ),
    buildEmiPortfolio(),
    // Leaderboard: top agents by verified sales value
    Sale.aggregate([
      { $match: { status: 'verified' } },
      { $group: { _id: '$agent', salesCount: { $sum: 1 }, salesValue: { $sum: '$agreedPrice' } } },
      { $sort: { salesValue: -1 } },
      { $limit: 10 },
    ]),
    CommissionRecord.aggregate([
      { $group: { _id: '$agent', commissionEarned: { $sum: '$commissionAmount' } } },
    ]),
    Lead.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]),
    Sale.countDocuments({ status: 'pending_review' }),
  ]);

  // Leaderboard enrichment: names/emails from User + commission totals merged in JS
  const commissionMap = new Map(
    commissionByAgentAgg.map((row) => [String(row._id), row.commissionEarned])
  );
  const agentUsers = await User.find({ _id: { $in: salesByAgentAgg.map((row) => row._id) } }).select('name email');
  const userMap = new Map(agentUsers.map((u) => [String(u._id), u]));

  const agentLeaderboard = salesByAgentAgg
    .map((row) => {
      const user = userMap.get(String(row._id));
      return {
        agentId: String(row._id),
        name: (user && user.name) || 'Unknown agent',
        email: (user && user.email) || '',
        salesCount: row.salesCount,
        salesValue: round2(row.salesValue),
        commissionEarned: round2(commissionMap.get(String(row._id)) || 0),
      };
    })
    .sort((a, b) => b.salesValue - a.salesValue)
    .slice(0, 10);

  // Pipeline snapshot: zero-initialized over every known stage
  const countsByStage = {};
  Lead.STAGES.forEach((stage) => {
    countsByStage[stage] = 0;
  });
  leadStageAgg.forEach(({ _id, count }) => {
    if (_id) countsByStage[_id] = count;
  });

  return {
    salesOverTime: toMonthlySalesSeries(monthKeys, salesOverTimeAgg),
    commissions: {
      earnedTotal: round2(commissionTotalsAgg[0] && commissionTotalsAgg[0].earnedTotal),
      paidAmount: round2(commissionTotalsAgg[0] && commissionTotalsAgg[0].paidAmount),
      pendingAmount: round2(commissionTotalsAgg[0] && commissionTotalsAgg[0].pendingAmount),
      paidCount: (commissionTotalsAgg[0] && commissionTotalsAgg[0].paidCount) || 0,
      pendingCount: (commissionTotalsAgg[0] && commissionTotalsAgg[0].pendingCount) || 0,
    },
    commissionOverTime: toMonthlyCommissionSeries(monthKeys, earnedOverTimeAgg, paidOverTimeAgg),
    emiPortfolio,
    agentLeaderboard,
    pipeline: {
      countsByStage,
      pendingSaleVerifications,
    },
  };
};

const buildAgentAnalytics = async (agentId) => {
  const agentOid = toObjectId(agentId);
  const monthKeys = buildMonthKeys(12);
  const windowStart = monthStartUtc(monthKeys[0]);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    thisMonthAgg,
    previousMonthAgg,
    earnedThisMonthAgg,
    paidThisMonthAgg,
    pendingAgg,
    lifetimePaidAgg,
    emiPortfolio,
    salesOverTimeAgg,
  ] = await Promise.all([
    // Performance: verified sales reviewed this calendar month
    Sale.aggregate([
      { $match: { agent: agentOid, status: 'verified', reviewedAt: { $ne: null, $gte: thisMonthStart } } },
      { $group: { _id: null, salesCount: { $sum: 1 }, salesValue: { $sum: '$agreedPrice' } } },
    ]),
    // ... and the previous month
    Sale.aggregate([
      {
        $match: {
          agent: agentOid,
          status: 'verified',
          reviewedAt: { $ne: null, $gte: previousMonthStart, $lt: thisMonthStart },
        },
      },
      { $group: { _id: null, salesCount: { $sum: 1 }, salesValue: { $sum: '$agreedPrice' } } },
    ]),
    // Commission buckets (mirror commissionController.getCommissionSummary)
    CommissionRecord.aggregate([
      { $match: { agent: agentOid, createdAt: { $gte: thisMonthStart } } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
    CommissionRecord.aggregate([
      { $match: { agent: agentOid, isPaid: true, paidAt: { $gte: thisMonthStart } } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
    CommissionRecord.aggregate([
      { $match: { agent: agentOid, isPaid: false } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
    CommissionRecord.aggregate([
      { $match: { agent: agentOid, isPaid: true } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
    buildEmiPortfolio({ agent: agentOid }),
    // Agent's own verified sales over the last 12 months
    Sale.aggregate(monthlyGroupStages('reviewedAt', { agent: agentOid, status: 'verified' }, windowStart)),
  ]);

  const thisMonth = {
    salesCount: (thisMonthAgg[0] && thisMonthAgg[0].salesCount) || 0,
    salesValue: round2(thisMonthAgg[0] && thisMonthAgg[0].salesValue),
  };
  const previousMonth = {
    salesCount: (previousMonthAgg[0] && previousMonthAgg[0].salesCount) || 0,
    salesValue: round2(previousMonthAgg[0] && previousMonthAgg[0].salesValue),
  };

  return {
    performance: {
      thisMonth,
      previousMonth,
      delta: {
        salesCount: thisMonth.salesCount - previousMonth.salesCount,
        salesValue: round2(thisMonth.salesValue - previousMonth.salesValue),
      },
    },
    commissions: {
      thisMonthEarned: round2(earnedThisMonthAgg[0] && earnedThisMonthAgg[0].total),
      thisMonthPaid: round2(paidThisMonthAgg[0] && paidThisMonthAgg[0].total),
      pending: round2(pendingAgg[0] && pendingAgg[0].total),
      pendingCount: (pendingAgg[0] && pendingAgg[0].count) || 0,
      lifetimePaid: round2(lifetimePaidAgg[0] && lifetimePaidAgg[0].total),
      lifetimePaidCount: (lifetimePaidAgg[0] && lifetimePaidAgg[0].count) || 0,
    },
    emiPortfolio,
    salesOverTime: toMonthlySalesSeries(monthKeys, salesOverTimeAgg),
  };
};

// ---------- report sections (shared metadata for CSV + PDF) ----------

const MONTHLY_SALES_COLUMNS = [
  { key: 'month', label: 'Month', width: 1 },
  { key: 'count', label: 'Sales closed', width: 1, align: 'right' },
  { key: 'value', label: 'Sales value (NPR)', width: 2, align: 'right' },
];

const EMI_COLUMNS = [
  { key: 'activePlans', label: 'Active plans', width: 1, align: 'right' },
  { key: 'completedPlans', label: 'Completed plans', width: 1, align: 'right' },
  { key: 'defaultedPlans', label: 'Defaulted plans', width: 1, align: 'right' },
  { key: 'overdueInstallments', label: 'Overdue installments', width: 1, align: 'right' },
  { key: 'totalOutstanding', label: 'Outstanding (NPR)', width: 2, align: 'right' },
];

const buildAdminSections = (analytics) => {
  const { salesOverTime, commissions, commissionOverTime, emiPortfolio, agentLeaderboard, pipeline } = analytics;
  return [
    {
      title: 'Verified sales - last 12 months',
      columns: MONTHLY_SALES_COLUMNS,
      rows: salesOverTime,
    },
    {
      title: 'Commissions',
      columns: [
        { key: 'earnedTotal', label: 'Earned total (NPR)', width: 2, align: 'right' },
        { key: 'paidAmount', label: 'Paid (NPR)', width: 2, align: 'right' },
        { key: 'pendingAmount', label: 'Pending (NPR)', width: 2, align: 'right' },
        { key: 'paidCount', label: 'Paid records', width: 1, align: 'right' },
        { key: 'pendingCount', label: 'Pending records', width: 1, align: 'right' },
      ],
      rows: [commissions],
    },
    {
      title: 'Commissions over time - last 12 months',
      columns: [
        { key: 'month', label: 'Month', width: 1 },
        { key: 'earned', label: 'Earned (NPR)', width: 1, align: 'right' },
        { key: 'paid', label: 'Paid (NPR)', width: 1, align: 'right' },
      ],
      rows: commissionOverTime,
    },
    {
      title: 'EMI portfolio',
      columns: EMI_COLUMNS,
      rows: [emiPortfolio],
    },
    {
      title: 'Agent leaderboard - verified sales',
      columns: [
        { key: 'name', label: 'Agent', width: 2 },
        { key: 'email', label: 'Email', width: 2 },
        { key: 'salesCount', label: 'Sales', width: 1, align: 'right' },
        { key: 'salesValue', label: 'Sales value (NPR)', width: 2, align: 'right' },
        { key: 'commissionEarned', label: 'Commission earned (NPR)', width: 2, align: 'right' },
      ],
      rows: agentLeaderboard,
    },
    {
      title: 'Lead pipeline by stage',
      columns: [
        { key: 'stage', label: 'Stage', width: 2 },
        { key: 'count', label: 'Leads', width: 1, align: 'right' },
      ],
      rows: Object.entries(pipeline.countsByStage).map(([stage, count]) => ({ stage, count })),
    },
    {
      title: 'Sale verification queue',
      columns: [{ key: 'pendingSaleVerifications', label: 'Pending sale verifications', width: 1, align: 'right' }],
      rows: [{ pendingSaleVerifications: pipeline.pendingSaleVerifications }],
    },
  ];
};

const buildAgentSections = (analytics) => {
  const { performance, commissions, emiPortfolio, salesOverTime } = analytics;
  return [
    {
      title: 'Performance - verified sales',
      columns: [
        { key: 'metric', label: 'Metric', width: 2 },
        { key: 'thisMonth', label: 'This month', width: 1, align: 'right' },
        { key: 'previousMonth', label: 'Previous month', width: 1, align: 'right' },
        { key: 'delta', label: 'Change', width: 1, align: 'right' },
      ],
      rows: [
        {
          metric: 'Sales closed',
          thisMonth: performance.thisMonth.salesCount,
          previousMonth: performance.previousMonth.salesCount,
          delta: performance.delta.salesCount,
        },
        {
          metric: 'Sales value (NPR)',
          thisMonth: performance.thisMonth.salesValue,
          previousMonth: performance.previousMonth.salesValue,
          delta: performance.delta.salesValue,
        },
      ],
    },
    {
      title: 'Commissions',
      columns: [
        { key: 'thisMonthEarned', label: 'Earned this month (NPR)', width: 2, align: 'right' },
        { key: 'thisMonthPaid', label: 'Paid this month (NPR)', width: 2, align: 'right' },
        { key: 'pending', label: 'Pending (NPR)', width: 2, align: 'right' },
        { key: 'lifetimePaid', label: 'Lifetime paid (NPR)', width: 2, align: 'right' },
      ],
      rows: [commissions],
    },
    {
      title: 'EMI portfolio',
      columns: EMI_COLUMNS,
      rows: [emiPortfolio],
    },
    {
      title: 'Verified sales - last 12 months',
      columns: MONTHLY_SALES_COLUMNS,
      rows: salesOverTime,
    },
  ];
};

// Agents see their own numbers; admins may pass ?agent=<id> to inspect one.
const resolveAgentScope = async (req) => {
  if (req.user.role !== 'admin' || !req.query.agent) {
    return { ok: true, agentId: req.user._id, agentName: req.user.name };
  }
  if (!mongoose.isValidObjectId(String(req.query.agent))) {
    return { ok: false, status: 400, message: 'Invalid agent filter' };
  }
  const agent = await User.findById(req.query.agent).select('name email role');
  if (!agent || agent.role !== 'agent') {
    return { ok: false, status: 404, message: 'Agent not found' };
  }
  return { ok: true, agentId: agent._id, agentName: agent.name };
};

// ---------- HTTP handlers ----------

/**
 * @desc    Platform-wide analytics for the admin dashboard
 * @route   GET /api/analytics/admin
 * @access  Private (admin)
 */
const getAdminAnalytics = asyncHandler(async (req, res) => {
  const analytics = await buildAdminAnalytics();
  res.json({ success: true, analytics });
});

/**
 * @desc    Agent-scoped analytics (agent = self; admin may pass ?agent=<id>)
 * @route   GET /api/analytics/agent
 * @access  Private (admin, agent)
 */
const getAgentAnalytics = asyncHandler(async (req, res) => {
  const scope = await resolveAgentScope(req);
  if (!scope.ok) {
    return res.status(scope.status).json({ success: false, message: scope.message });
  }
  const analytics = await buildAgentAnalytics(scope.agentId);
  res.json({ success: true, analytics });
});

/**
 * @desc    Download the analytics report as CSV or PDF
 * @route   GET /api/analytics/export?type=admin|agent&format=csv|pdf[&agent=<id>]
 * @access  Private (admin, agent)
 */
const exportAnalytics = asyncHandler(async (req, res) => {
  const { type } = req.query;
  if (type !== 'admin' && type !== 'agent') {
    return res.status(400).json({ success: false, message: "Query param 'type' must be 'admin' or 'agent'" });
  }
  const format = req.query.format === 'pdf' ? 'pdf' : 'csv'; // default csv

  let analytics;
  let title;
  if (type === 'admin') {
    analytics = await buildAdminAnalytics();
    title = 'Admin analytics report';
  } else {
    const scope = await resolveAgentScope(req);
    if (!scope.ok) {
      return res.status(scope.status).json({ success: false, message: scope.message });
    }
    analytics = await buildAgentAnalytics(scope.agentId);
    title = `Agent analytics report - ${scope.agentName}`;
  }

  const sections = type === 'admin' ? buildAdminSections(analytics) : buildAgentSections(analytics);
  const generatedAt = new Date();
  const dateStamp = generatedAt.toISOString().slice(0, 10);

  if (format === 'pdf') {
    const buffer = await reportGenerator.generatePdf({ title, generatedAt, sections });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${type}-${dateStamp}.pdf"`);
    return res.end(buffer);
  }

  const csv = reportGenerator.generateCsv({ title, generatedAt, sections });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="report-${type}-${dateStamp}.csv"`);
  return res.end(Buffer.from(csv, 'utf8'));
});

module.exports = { getAdminAnalytics, getAgentAnalytics, exportAnalytics };
