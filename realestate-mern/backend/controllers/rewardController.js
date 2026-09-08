const User = require('../models/User');
const RewardTransaction = require('../models/RewardTransaction');
const asyncHandler = require('../utils/asyncHandler');
const { levelForXp, nextLevelInfo, LEVELS } = require('../utils/rewardLevels');

// @desc    Get the logged-in user's Youth Rewards wallet - XP, YC balance,
//          current level, and progress toward the next level
// @route   GET /api/rewards/wallet
// @access  Private
const getWallet = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('xp ycCoin');
  const xp = user.xp || 0;

  res.json({
    success: true,
    wallet: {
      xp,
      ycCoin: user.ycCoin || 0,
      level: levelForXp(xp),
      nextLevel: nextLevelInfo(xp),
      levels: LEVELS,
    },
  });
});

// @desc    Get the logged-in user's reward transaction history (newest first)
// @route   GET /api/rewards/transactions
// @access  Private
const getTransactions = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

  const [transactions, total] = await Promise.all([
    RewardTransaction.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    RewardTransaction.countDocuments({ user: req.user._id }),
  ]);

  res.json({
    success: true,
    transactions,
    page,
    pages: Math.ceil(total / limit) || 1,
    total,
  });
});

module.exports = { getWallet, getTransactions };
