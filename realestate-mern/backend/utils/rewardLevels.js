// Single source of truth for the Youth Real Estate XP / YC (Youth Coin) reward
// system. Kept dependency-free (no model imports) so it can be safely
// required from both the User model (for the `level` virtual) and the
// controllers that award rewards, without any circular-require issues.

// Lifetime XP thresholds -> level name. XP is cumulative and never
// decreases, so a user's level only ever goes up.
const LEVELS = [
  { name: 'Bronze', min: 0 },
  { name: 'Silver', min: 5001 },
  { name: 'Gold', min: 20001 },
  { name: 'Platinum', min: 50001 },
  { name: 'Diamond', min: 100001 },
];

const levelForXp = (xp = 0) => {
  let current = LEVELS[0].name;
  for (const lvl of LEVELS) {
    if (xp >= lvl.min) current = lvl.name;
  }
  return current;
};

// Returns { name, xpNeeded } for the next level, or null if already at the
// top level (Diamond).
const nextLevelInfo = (xp = 0) => {
  const idx = LEVELS.findIndex((l) => l.name === levelForXp(xp));
  const next = LEVELS[idx + 1];
  if (!next) return null;
  return { name: next.name, xpNeeded: Math.max(next.min - xp, 0) };
};

// Reward actions currently wired into the live app. Each key is used both as
// the RewardTransaction "action" value and as the lookup key when awarding.
//
// NOTE: the client's reward sheet only specifies YC (Youth Coin) amounts -
// there's no separate XP table. XP mirrors the YC amount 1:1 for every
// action below (adjust independently here if that should ever change).
const ACTIONS = {
  ACCOUNT_REGISTER: { label: 'नयाँ Account Register', labelEn: 'New account registered', yc: 100 },
  PROFILE_COMPLETE: { label: 'Profile पूरा गर्ने', labelEn: 'Profile completed', yc: 50 },
  EMAIL_VERIFY: { label: 'Email Verify', labelEn: 'Email verified', yc: 50 },
  PHONE_VERIFY: { label: 'Phone Verify', labelEn: 'Phone verified', yc: 50 },
  PROPERTY_SAVE: { label: 'Property Save गर्ने', labelEn: 'Property saved', yc: 10 },
  PROPERTY_SHARE: { label: 'Property Share गर्ने', labelEn: 'Property shared', yc: 20 },
  PROPERTY_VISIT_BOOK: { label: 'Property Visit Book गर्ने', labelEn: 'Site visit booked', yc: 100 },
  SITE_VISIT_COMPLETE: { label: 'Site Visit पूरा गर्ने', labelEn: 'Site visit completed', yc: 300 },
  PROPERTY_BUY: { label: 'Property खरिद गर्ने', labelEn: 'Property purchased', yc: 10000 },
  PROPERTY_SELL: { label: 'Property बेच्ने', labelEn: 'Property sold', yc: 8000 },
  REFERRAL_ACCOUNT: { label: 'साथीलाई Refer गर्ने (Account)', labelEn: 'Referred friend joined', yc: 200 },
  REFERRAL_SALE: { label: 'सफल Referral Sale', labelEn: 'Referral led to a sale', yc: 5000 },
  REVIEW_WRITE: { label: 'Review लेख्ने', labelEn: 'Review written', yc: 100 },
  DAILY_LOGIN: { label: 'दैनिक Login', labelEn: 'Daily login', yc: 5 },
  LOGIN_STREAK_7DAY: { label: '7-Day Login Streak', labelEn: '7-day login streak', yc: 100 },
  BIRTHDAY_BONUS: { label: 'Birthday Bonus', labelEn: 'Birthday bonus', yc: 500 },
};

module.exports = { LEVELS, levelForXp, nextLevelInfo, ACTIONS };
