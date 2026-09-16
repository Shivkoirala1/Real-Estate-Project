// One-time migration: backfills the new moderation fields added to the
// Review model (eligibility, isVisible, adminReply) onto any reviews that
// were created before this update, so old documents don't fail validation
// on save and behave sensibly with the new admin dashboard.
//
// Reviews created before this feature predate the eligibility check, so
// there's no reliable way to know whether they came from a visit or a
// purchase - they're backfilled as 'visit' (the more common path) purely so
// the now-required field is populated; it does not retroactively re-verify
// them. All existing reviews are marked visible, since none were hidden
// before this feature existed.
//
// Usage:  node utils/migrateReviewFields.js

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Review = require('../models/Review');

const run = async () => {
  await connectDB();

  const result = await Review.updateMany(
    { eligibility: { $exists: false } },
    {
      $set: {
        eligibility: 'visit',
        isVisible: true,
      },
    }
  );

  console.log(`Backfilled ${result.modifiedCount} pre-existing review(s) with default moderation fields.`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
