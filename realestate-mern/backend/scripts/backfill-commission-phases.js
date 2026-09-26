// Idempotent backfill: legacy CommissionRecords -> two-phase payout fields.
//
// Mapping (per approved decisions):
//   isPaid=false -> both phases unpaid, payoutStatus 'pending'
//   isPaid=true  -> both phases paid, payoutStatus 'paid' (legacy paidAt kept)
// Split: phase1Amount = round2(total/2), phase2Amount = total - phase1Amount.
//
// Idempotence: a record is skipped when its phase amounts already sum to the
// total (±0.01) AND payoutStatus is a valid phase status. Running twice (or
// after new phased records exist) changes nothing.
//
// Usage:
//   node scripts/backfill-commission-phases.js            # live run
//   node scripts/backfill-commission-phases.js --dry-run  # report only
require('dotenv').config();
const mongoose = require('mongoose');

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const main = async () => {
  const dryRun = process.argv.includes('--dry-run');
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('backfill-commission-phases: missing MONGODB_URI (or MONGO_URI) env var.');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  const CommissionRecord = require('../models/CommissionRecord');

  const all = await CommissionRecord.find({});
  let migrated = 0;
  let skipped = 0;
  let zeroSettled = 0;

  for (const doc of all) {
    const total = round2(doc.commissionAmount);
    const p1 = doc.phase1Amount != null ? Number(doc.phase1Amount) : null;
    const p2 = doc.phase2Amount != null ? Number(doc.phase2Amount) : null;
    const alreadyMigrated = p1 != null && p2 != null
      && Math.abs(round2(p1 + p2) - total) <= 0.01
      && ['pending', 'partial', 'paid'].includes(doc.payoutStatus);
    if (alreadyMigrated) {
      skipped += 1;
      continue;
    }

    const half = round2(total / 2);
    const remainder = round2(total - half);
    doc.phase1Amount = half;
    doc.phase2Amount = remainder;

    if (total === 0 || doc.isPaid) {
      doc.phase1Paid = true;
      doc.phase2Paid = true;
      doc.phase1PaidAt = doc.phase1PaidAt || doc.paidAt || new Date();
      doc.phase2PaidAt = doc.phase2PaidAt || doc.paidAt || new Date();
      doc.payoutStatus = 'paid';
      doc.isPaid = true;
      doc.paidAt = doc.phase2PaidAt;
      if (total === 0) {
        doc.paidNote = doc.paidNote || 'Zero commission - auto-settled';
        zeroSettled += 1;
      }
    } else {
      doc.phase1Paid = false;
      doc.phase2Paid = false;
      doc.phase1PaidAt = null;
      doc.phase2PaidAt = null;
      doc.payoutStatus = 'pending';
      doc.isPaid = false;
      doc.paidAt = null;
    }

    if (!dryRun) {
      // validate() runs the model hook which re-derives the compat fields as
      // a cross-check; save() persists.
      await doc.save();
    }
    migrated += 1;
  }

  console.log(
    `backfill-commission-phases${dryRun ? ' [dry-run]' : ''}: scanned=${all.length} migrated=${migrated} skipped=${skipped} zeroSettled=${zeroSettled}`
  );
  await mongoose.disconnect();
};

main().catch((err) => {
  console.error('backfill-commission-phases: FAILED -', err.message);
  process.exit(1);
});
