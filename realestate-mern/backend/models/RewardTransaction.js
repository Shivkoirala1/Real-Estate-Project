const mongoose = require('mongoose');

// A permanent ledger entry every time a user earns XP/YC. Kept separate from
// the User model so users have a full, auditable history of how their
// balance was built up (shown on the Wallet page), and so repeat-triggering
// actions (like saving a property) can be deduplicated by checking for an
// existing transaction before awarding again.
const rewardTransactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Key into ACTIONS in utils/rewardLevels.js, e.g. 'PROPERTY_SAVE'
    action: { type: String, required: true },
    label: { type: String, required: true },

    xp: { type: Number, default: 0 },
    yc: { type: Number, default: 0 },

    // Optional reference to the specific item the reward was tied to (e.g. a
    // Property id for PROPERTY_SAVE), used to prevent double-rewarding the
    // same action on the same item.
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    refModel: { type: String, default: null },

    // Optional arbitrary dedupe key for rewards that repeat over time and
    // aren't tied to a single document, e.g. 'daily-2026-08-26' for a daily
    // login reward, or 'birthday-2026' for an annual birthday bonus.
    key: { type: String, default: null },
  },
  { timestamps: true }
);

rewardTransactionSchema.index({ user: 1, action: 1, refId: 1 });
rewardTransactionSchema.index({ user: 1, action: 1, key: 1 });
rewardTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('RewardTransaction', rewardTransactionSchema);
