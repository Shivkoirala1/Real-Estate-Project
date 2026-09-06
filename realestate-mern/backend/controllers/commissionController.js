const mongoose = require('mongoose');
const CommissionRecord = require('../models/CommissionRecord');
const asyncHandler = require('../utils/asyncHandler');
const { notify } = require('../utils/notify');

// ---------- helpers ----------

// Money-ish numbers are stored as plain floats - round for display so the
// frontend never renders values like 24500.000000001.
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

// Agents only ever see their own commissions; admins see everyone's and may
// narrow the list to a single agent with ?agent=<id>.
const buildCommissionFilter = (req) => {
  const filter = {};

  if (req.user.role === 'agent') {
    filter.agent = req.user._id;
  } else if (req.query.agent) {
    filter.agent = req.query.agent;
  }

  if (req.query.isPaid === 'true') filter.isPaid = true;
  else if (req.query.isPaid === 'false') filter.isPaid = false;

  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }

  return filter;
};

// $match can't be reused straight from a Mongoose filter when values may be
// strings (e.g. ?agent=) - cast the agent id to a real ObjectId first.
const toMatchStage = (filter) => {
  const match = { ...filter };
  if (match.agent) match.agent = new mongoose.Types.ObjectId(String(match.agent));
  return match;
};

const COMMISSION_POPULATE = [
  { path: 'property', select: 'title slug media.coverImage status' },
  { path: 'agent', select: 'name email' },
  { path: 'sale', select: 'agreedPrice paymentType submittedAt' },
];

const commissionSortMap = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  amount_desc: { commissionAmount: -1 },
  amount_asc: { commissionAmount: 1 },
};

// @desc    List commission records (agent sees own, admin sees all/filtered)
// @route   GET /api/commissions
// @access  Private (admin/agent)
const getCommissions = asyncHandler(async (req, res) => {
  const { sort } = req.query;
  const filter = buildCommissionFilter(req);

  // Validate the agent filter before it reaches either the find (CastError ->
  // 500) or the aggregate (silently matches nothing).
  if (filter.agent && !mongoose.isValidObjectId(String(filter.agent))) {
    return res.status(400).json({ success: false, message: 'Invalid agent filter' });
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 10), 100);
  const skip = (page - 1) * limit;

  const [commissions, total, totalsAgg] = await Promise.all([
    CommissionRecord.find(filter)
      .populate(COMMISSION_POPULATE)
      .sort(commissionSortMap[sort] || commissionSortMap.newest)
      .skip(skip)
      .limit(limit),
    CommissionRecord.countDocuments(filter),
    // Totals cover the SAME filter (minus pagination) so header cards stay
    // correct on every page/tab of the table.
    CommissionRecord.aggregate([
      { $match: toMatchStage(filter) },
      {
        $group: {
          _id: null,
          totalPaidAmount: { $sum: { $cond: [{ $eq: ['$isPaid', true] }, '$commissionAmount', 0] } },
          pendingAmount: { $sum: { $cond: [{ $eq: ['$isPaid', false] }, '$commissionAmount', 0] } },
          paidCount: { $sum: { $cond: [{ $eq: ['$isPaid', true] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ['$isPaid', false] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const totals = totalsAgg[0] || { totalPaidAmount: 0, pendingAmount: 0, paidCount: 0, pendingCount: 0 };

  res.json({
    success: true,
    commissions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    totals: {
      totalPaidAmount: round2(totals.totalPaidAmount),
      pendingAmount: round2(totals.pendingAmount),
      paidCount: totals.paidCount,
      pendingCount: totals.pendingCount,
    },
  });
});

// @desc    Earnings summary for the logged-in agent's dashboard card
// @route   GET /api/commissions/summary
// @access  Private (admin/agent - each scoped to their own user id)
const getCommissionSummary = asyncHandler(async (req, res) => {
  // Always scoped to the caller - an agent can only ever see their own
  // numbers, and an admin (who files no sales) simply gets an empty summary.
  const me = req.user._id;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [earnedAgg, paidThisMonthAgg, pendingAgg, lifetimePaidAgg] = await Promise.all([
    // Everything earned this month (paid or not) - commissions are created at
    // sale-verification time, so createdAt is the "earned on" date.
    CommissionRecord.aggregate([
      { $match: { agent: me, createdAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
    // Of this month's earnings, how much was actually settled this month
    CommissionRecord.aggregate([
      { $match: { agent: me, isPaid: true, paidAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
    CommissionRecord.aggregate([
      { $match: { agent: me, isPaid: false } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
    CommissionRecord.aggregate([
      { $match: { agent: me, isPaid: true } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
  ]);

  res.json({
    success: true,
    summary: {
      thisMonthEarned: round2(earnedAgg[0]?.total),
      thisMonthPaid: round2(paidThisMonthAgg[0]?.total),
      pending: round2(pendingAgg[0]?.total),
      pendingCount: pendingAgg[0]?.count || 0,
      lifetimePaid: round2(lifetimePaidAgg[0]?.total),
      lifetimePaidCount: lifetimePaidAgg[0]?.count || 0,
    },
  });
});

// @desc    Mark a commission record as paid (admin settling an agent's commission)
// @route   PATCH /api/commissions/:id/mark-paid
// @access  Private (admin)
const markCommissionPaid = asyncHandler(async (req, res) => {
  const record = await CommissionRecord.findById(req.params.id);
  if (!record) {
    return res.status(404).json({ success: false, message: 'Commission record not found' });
  }

  if (record.isPaid) {
    return res.status(400).json({ success: false, message: 'This commission is already marked as paid.' });
  }

  const { paidNote } = req.body;
  record.isPaid = true;
  record.paidAt = new Date();
  record.paidNote = paidNote || '';
  await record.save();

  await record.populate(COMMISSION_POPULATE);

  await notify({
    recipient: record.agent._id,
    type: 'commission_paid',
    title: 'Commission paid',
    message: `Your commission of NPR ${record.commissionAmount.toLocaleString()} for "${record.property.title}" has been marked as paid.`,
    commissionRecord: record._id,
    property: record.property._id,
    link: '/dashboard/agent/commissions',
  });

  res.json({
    success: true,
    message: 'Commission marked as paid',
    commission: record,
  });
});

module.exports = {
  getCommissions,
  getCommissionSummary,
  markCommissionPaid,
};
