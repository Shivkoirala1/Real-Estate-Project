// Backfill: sets Lead.closedBy for pre-existing closed leads based on
// identifiable verified transactions.
//
//   closed lead + verified Sale   -> closedBy = 'sale_verified'
//   closed lead + verified Rental -> closedBy = 'rental_verified'
//   everything else               -> left as 'manual' (schema default)
//
// Safety properties:
// - Idempotent: only touches leads whose closedBy is 'manual'/unset, and
//   only when exactly one verified transaction references them. Re-runs
//   change nothing.
// - Ambiguity: a lead matching BOTH a verified sale and a verified rental
//   is reported and left untouched - never silently chosen.
// - Non-destructive: touches Lead.closedBy only. Sale/Rental/Property/
//   CommissionRecord documents are only read, never written.
//
// Usage:
//   node utils/migrateLeadClosedBy.js --dry-run   (default: report only)
//   node utils/migrateLeadClosedBy.js --execute   (apply changes)

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Lead = require('../models/Lead');
const Sale = require('../models/Sale');
const Rental = require('../models/Rental');

const run = async () => {
  const execute = process.argv.includes('--execute');

  await connectDB();

  const closedLeads = await Lead.find({ stage: 'closed' }).select('_id closedBy').lean();
  console.log(`Found ${closedLeads.length} closed lead(s). Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'}.`);

  let saleMarked = 0;
  let rentalMarked = 0;
  let alreadyMarked = 0;
  let leftManual = 0;
  const ambiguous = [];

  for (const lead of closedLeads) {
    // Idempotency: a previous run (or the live verify flow) already set this.
    if (lead.closedBy && lead.closedBy !== 'manual') {
      alreadyMarked += 1;
      continue;
    }
    const [sale, rental] = await Promise.all([
      Sale.exists({ lead: lead._id, status: 'verified' }),
      Rental.exists({ lead: lead._id, status: 'verified' }),
    ]);
    if (sale && rental) {
      ambiguous.push(String(lead._id));
      continue;
    }
    const closedBy = sale ? 'sale_verified' : rental ? 'rental_verified' : null;
    if (!closedBy) {
      leftManual += 1;
      continue;
    }
    if (execute) {
      // Guarded write: only flips still-manual rows, so concurrent live
      // verifications can never be overwritten by this script.
      const res = await Lead.updateOne(
        { _id: lead._id, $or: [{ closedBy: 'manual' }, { closedBy: { $exists: false } }] },
        { $set: { closedBy } }
      );
      if (res.modifiedCount === 1) {
        if (sale) saleMarked += 1;
        else rentalMarked += 1;
      } else {
        alreadyMarked += 1;
      }
    } else if (sale) {
      saleMarked += 1;
    } else {
      rentalMarked += 1;
    }
  }

  console.log(`Would mark sale_verified: ${saleMarked} | rental_verified: ${rentalMarked}`);
  console.log(`Already marked: ${alreadyMarked} | left manual: ${leftManual} | ambiguous: ${ambiguous.length}`);
  if (ambiguous.length > 0) {
    console.log('Ambiguous lead ids (matched BOTH a verified sale and rental - left untouched):');
    ambiguous.forEach((id) => console.log(`  - ${id}`));
  }
  if (!execute) {
    console.log('Dry run complete - no documents were modified. Re-run with --execute to apply.');
  }

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
