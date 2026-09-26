const mongoose = require('mongoose');
const CommissionRecord = require('../models/CommissionRecord');
const asyncHandler = require('../utils/asyncHandler');
const { notify } = require('../utils/notify');
const { PAYOUT_STATUSES } = require('../utils/commissionPhases');

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

  // New source of truth (?payoutStatus=pending|partial|paid). The legacy
  // ?isPaid flag is preserved: true -> fully paid, false -> not fully paid
  // (pending + partial), matching the old isPaid=false result set.
  if (req.query.payoutStatus) {
    if (!PAYOUT_STATUSES.includes(req.query.payoutStatus)) {
      const err = new Error(
        `Invalid payoutStatus filter (expected one of: ${PAYOUT_STATUSES.join(', ')}).`
      );
      err.statusCode = 400;
      throw err;
    }
    filter.payoutStatus = req.query.payoutStatus;
  } else if (req.query.isPaid === 'true') {
    filter.payoutStatus = 'paid';
  } else if (req.query.isPaid === 'false') {
    filter.payoutStatus = { $in: ['pending', 'partial'] };
  }

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
  // NOTE (B2): the sale entry was dropped — tables read denormalized
  // transactionAmount/commissionPercentage/commissionAmount and never the
  // populated sale.
  // B4: rental populated symmetrically (additive; pair kept, no discriminator).
  { path: 'rental', select: 'monthlyRent durationInMonths' },
];

const commissionSortMap = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  amount_desc: { commissionAmount: -1 },
  amount_asc: { commissionAmount: 1 },
};

// Paid = sum of actually-paid PHASE amounts (never the whole record when
// only phase 1 is settled). Pending = sum of unpaid phase amounts.
// Partial = unpaid remainder sitting on partially-paid records.
const TOTALS_GROUP = {
  _id: null,
  totalPaidAmount: {
    $sum: {
      $add: [
        { $cond: [{ $eq: ['$phase1Paid', true] }, '$phase1Amount', 0] },
        { $cond: [{ $eq: ['$phase2Paid', true] }, '$phase2Amount', 0] },
      ],
    },
  },
  pendingAmount: {
    $sum: {
      $add: [
        { $cond: [{ $eq: ['$phase1Paid', false] }, '$phase1Amount', 0] },
        { $cond: [{ $eq: ['$phase2Paid', false] }, '$phase2Amount', 0] },
      ],
    },
  },
  partialAmount: {
    $sum: { $cond: [{ $eq: ['$payoutStatus', 'partial'] }, '$phase2Amount', 0] },
  },
  paidCount: { $sum: { $cond: [{ $eq: ['$payoutStatus', 'paid'] }, 1, 0] } },
  pendingCount: { $sum: { $cond: [{ $eq: ['$payoutStatus', 'pending'] }, 1, 0] } },
  partialCount: { $sum: { $cond: [{ $eq: ['$payoutStatus', 'partial'] }, 1, 0] } },
};

// @desc    List commission records (agent sees own, admin sees all/filtered)
// @route   GET /api/commissions
// @access  Private (admin/agent)
const getCommissions = asyncHandler(async (req, res) => {
  const { sort } = req.query;
  let filter;
  try {
    filter = buildCommissionFilter(req);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }

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
      { $group: TOTALS_GROUP },
    ]),
  ]);

  const totals = totalsAgg[0] || {
    totalPaidAmount: 0,
    pendingAmount: 0,
    partialAmount: 0,
    paidCount: 0,
    pendingCount: 0,
    partialCount: 0,
  };

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
      partialAmount: round2(totals.partialAmount),
      paidCount: totals.paidCount,
      pendingCount: totals.pendingCount,
      partialCount: totals.partialCount,
      // unpaidCount preserves the old pendingCount meaning (every record not
      // yet fully paid) for callers migrating off the single-flag world.
      unpaidCount: (totals.pendingCount || 0) + (totals.partialCount || 0),
    },
  });
});

// Sum of phase amounts settled inside a window, without double counting:
// each phase contributes only via its own paid flag + paid-at timestamp.
const paidInWindowSum = (start, end) => ({
  $sum: {
    $add: [
      {
        $cond: [
          {
            $and: [
              { $eq: ['$phase1Paid', true] },
              { $gte: ['$phase1PaidAt', start] },
              ...(end ? [{ $lt: ['$phase1PaidAt', end] }] : []),
            ],
          },
          '$phase1Amount',
          0,
        ],
      },
      {
        $cond: [
          {
            $and: [
              { $eq: ['$phase2Paid', true] },
              { $gte: ['$phase2PaidAt', start] },
              ...(end ? [{ $lt: ['$phase2PaidAt', end] }] : []),
            ],
          },
          '$phase2Amount',
          0,
        ],
      },
    ],
  },
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

  const [earnedAgg, paidThisMonthAgg, pendingAgg, lifetimePaidAgg, partialAgg] = await Promise.all([
    // Everything earned this month (paid or not) - commissions are created at
    // sale-verification time, so createdAt is the "earned on" date.
    CommissionRecord.aggregate([
      { $match: { agent: me, createdAt: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
    // Of this month's window, how much was actually settled (either phase).
    CommissionRecord.aggregate([
      {
        $match: {
          agent: me,
          $or: [
            { phase1PaidAt: { $gte: monthStart } },
            { phase2PaidAt: { $gte: monthStart } },
          ],
        },
      },
      { $group: { _id: null, total: paidInWindowSum(monthStart), count: { $sum: 1 } } },
    ]),
    CommissionRecord.aggregate([
      { $match: { agent: me, payoutStatus: { $in: ['pending', 'partial'] } } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $add: [
                { $cond: [{ $eq: ['$phase1Paid', false] }, '$phase1Amount', 0] },
                { $cond: [{ $eq: ['$phase2Paid', false] }, '$phase2Amount', 0] },
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    CommissionRecord.aggregate([
      { $match: { agent: me } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $add: [
                { $cond: [{ $eq: ['$phase1Paid', true] }, '$phase1Amount', 0] },
                { $cond: [{ $eq: ['$phase2Paid', true] }, '$phase2Amount', 0] },
              ],
            },
          },
          count: { $sum: { $cond: [{ $eq: ['$payoutStatus', 'paid'] }, 1, 0] } },
        },
      },
    ]),
    CommissionRecord.aggregate([
      { $match: { agent: me, payoutStatus: 'partial' } },
      { $group: { _id: null, total: { $sum: '$phase2Amount' }, count: { $sum: 1 } } },
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
      partial: round2(partialAgg[0]?.total),
      partialCount: partialAgg[0]?.count || 0,
    },
  });
});

// Shared payout writer: backend-enforced ordering, double-pay protection and
// legacy-field synchronization. The model hook re-derives payoutStatus/isPaid
// on save as a second line of defense.
const applyPhasePayment = async (record, phase, note) => {
  const now = new Date();
  if (phase === 1) {
    if (record.phase1Paid) {
      const err = new Error('Phase 1 of this commission is already paid.');
      err.statusCode = 400;
      throw err;
    }
    record.phase1Paid = true;
    record.phase1PaidAt = now;
    record.phase1Note = note || '';
  } else {
    if (!record.phase1Paid) {
      const err = new Error('Phase 1 must be paid before Phase 2.');
      err.statusCode = 400;
      throw err;
    }
    if (record.phase2Paid) {
      const err = new Error('Phase 2 of this commission is already paid.');
      err.statusCode = 400;
      throw err;
    }
    record.phase2Paid = true;
    record.phase2PaidAt = now;
    record.phase2Note = note || '';
  }
  await record.save();
  return record;
};

// @desc    Pay phase 1 of a commission (admin settling the first installment)
// @route   PATCH /api/commissions/:id/pay-phase-1
// @access  Private (admin)
const payPhase1 = asyncHandler(async (req, res) => {
  const record = await CommissionRecord.findById(req.params.id);
  if (!record) {
    return res.status(404).json({ success: false, message: 'Commission record not found' });
  }

  try {
    await applyPhasePayment(record, 1, req.body?.note ?? req.body?.paidNote);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }

  await record.populate(COMMISSION_POPULATE);

  await notify({
    recipient: record.agent._id,
    type: 'commission_phase1_paid',
    title: 'Commission phase 1 paid',
    message: `Phase 1 of your commission (NPR ${Number(record.phase1Amount).toLocaleString()} of NPR ${Number(record.commissionAmount).toLocaleString()}) for "${record.property.title}" has been marked as paid.`,
    commissionRecord: record._id,
    property: record.property._id,
    link: '/dashboard/agent/commissions',
  });

  res.json({
    success: true,
    message: 'Commission phase 1 marked as paid',
    commission: record,
  });
});

// @desc    Pay phase 2 of a commission (admin settling the final installment)
// @route   PATCH /api/commissions/:id/pay-phase-2
// @access  Private (admin)
const payPhase2 = asyncHandler(async (req, res) => {
  const record = await CommissionRecord.findById(req.params.id);
  if (!record) {
    return res.status(404).json({ success: false, message: 'Commission record not found' });
  }

  try {
    await applyPhasePayment(record, 2, req.body?.note ?? req.body?.paidNote);
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }

  await record.populate(COMMISSION_POPULATE);

  await notify({
    recipient: record.agent._id,
    type: 'commission_paid',
    title: 'Commission fully paid',
    message: `Your commission of NPR ${record.commissionAmount.toLocaleString()} for "${record.property.title}" is now fully paid (phase 2 NPR ${Number(record.phase2Amount).toLocaleString()} settled).`,
    commissionRecord: record._id,
    property: record.property._id,
    link: '/dashboard/agent/commissions',
  });

  res.json({
    success: true,
    message: 'Commission phase 2 marked as paid - commission fully paid',
    commission: record,
  });
});

// @desc    DEPRECATED compatibility alias: advances the remaining payable
//          phase(s) in order so old callers keep working. New code must call
//          pay-phase-1 / pay-phase-2 directly. Removed next release.
// @route   PATCH /api/commissions/:id/mark-paid
// @access  Private (admin)
const markCommissionPaid = asyncHandler(async (req, res) => {
  const record = await CommissionRecord.findById(req.params.id);
  if (!record) {
    return res.status(404).json({ success: false, message: 'Commission record not found' });
  }

  if (record.payoutStatus === 'paid') {
    return res.status(400).json({ success: false, message: 'This commission is already marked as paid.' });
  }

  const note = req.body?.paidNote ?? req.body?.note ?? '';
  const phasesPaid = [];
  try {
    if (!record.phase1Paid) {
      await applyPhasePayment(record, 1, note);
      phasesPaid.push(1);
    }
    if (!record.phase2Paid) {
      // Reuse the caller's single note for the final phase only when phase 1
      // was already settled earlier (otherwise the note belongs to phase 1).
      await applyPhasePayment(record, 2, record.payoutStatus === 'partial' && phasesPaid.length === 0 ? note : record.phase2Note);
      phasesPaid.push(2);
    }
  } catch (err) {
    return res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }

  await record.populate(COMMISSION_POPULATE);

  // Notify once for the final settlement (phase-1-only transitions via this
  // alias cannot happen: the alias always settles everything remaining).
  await notify({
    recipient: record.agent._id,
    type: 'commission_paid',
    title: 'Commission paid',
    message: `Your commission of NPR ${record.commissionAmount.toLocaleString()} for "${record.property.title}" has been marked as paid.`,
    commissionRecord: record._id,
    property: record.property._id,
    link: '/dashboard/agent/commissions',
  });

  res.set('Deprecation', 'true');
  res.set('Sunset', 'next-release');
  res.json({
    success: true,
    message: 'Commission marked as paid [deprecated: use pay-phase-1 / pay-phase-2]',
    deprecationWarning: 'PATCH /:id/mark-paid is deprecated and will be removed next release. Use PATCH /:id/pay-phase-1 and PATCH /:id/pay-phase-2.',
    commission: record,
  });
});

module.exports = {
  getCommissions,
  getCommissionSummary,
  payPhase1,
  payPhase2,
  markCommissionPaid,
};
