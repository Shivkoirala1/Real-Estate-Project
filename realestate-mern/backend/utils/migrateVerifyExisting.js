// One-time migration: marks every account that already existed BEFORE the
// email-verification feature as verified, so real users who registered
// before this update aren't locked out of login (they never received a code
// for a flow that didn't exist yet).
//
// Run this ONCE, right after pulling these changes, BEFORE anyone new
// registers - any registration made after this runs is correctly left
// unverified until they confirm their emailed code, same as intended.
//
// Usage:  node utils/migrateVerifyExisting.js

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

const run = async () => {
  await connectDB();

  const result = await User.updateMany(
    { isEmailVerified: { $ne: true } },
    { $set: { isEmailVerified: true } }
  );

  console.log(`Marked ${result.modifiedCount} existing account(s) as email-verified.`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
