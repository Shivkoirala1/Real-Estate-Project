const RewardTransaction = require('../models/RewardTransaction');
const User = require('../models/User');
const { ACTIONS } = require('./rewardLevels');

/**
 * Awards XP/YC for a given action to a user, and logs a RewardTransaction so
 * it shows up in their wallet history.
 *
 * When `refId` is supplied (e.g. a Property id for PROPERTY_SAVE), the same
 * user can only be rewarded once per (action, refId) pair - re-saving the
 * same property, or re-triggering the same event on the same item, won't pay
 * out twice. Actions without a refId (register, email verify, profile
 * complete) are one-time-per-user by nature, but are still guarded the same
 * way in case the calling code is ever changed to call this more than once.
 *
 * Returns the created RewardTransaction, or null if this exact reward was
 * already granted before (no-op, not an error - callers can safely call
 * this on every relevant request without checking first).
 */
const awardReward = async (userId, actionKey, { refId = null, refModel = null, key = null } = {}) => {
  const action = ACTIONS[actionKey];
  if (!action) throw new Error(`Unknown reward action: ${actionKey}`);

  // Rewards tied to a specific document (refId) dedupe on that document;
  // time-based repeating rewards (key, e.g. a date string) dedupe on that
  // key instead; everything else is treated as one-time-per-user.
  const dedupeQuery = { user: userId, action: actionKey };
  if (key) dedupeQuery.key = key;
  else dedupeQuery.refId = refId || null;

  const alreadyAwarded = await RewardTransaction.findOne(dedupeQuery);
  if (alreadyAwarded) return null;

  const yc = action.yc;
  const xp = action.yc * 2; 

  const [txn] = await Promise.all([
    RewardTransaction.create({ user: userId, action: actionKey, label: action.label, xp, yc, refId, refModel, key }),
    User.findByIdAndUpdate(userId, { $inc: { xp, ycCoin: yc } }),
  ]);

  return txn;
};

module.exports = { awardReward };
