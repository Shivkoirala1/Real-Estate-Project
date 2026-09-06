// One-time backfill migration: brings every EXISTING contact form submission
// and visit request into the unified lead pipeline.
//
// Why: the lead module now auto-converts every incoming contact form and
// visit request (smart de-duplication + auto-seeded unified conversation
// threads). Records that arrived before that feature went live still need a
// pipeline presence - this script runs the exact same conversion service
// (utils/leadAutoConversion.js) over them, so historical data follows the
// identical rules: de-duplicated against active leads, conversations seeded
// where possible, everything cross-linked.
//
// The script is idempotent: submissions/visits that already have a
// `convertedLead` (or a lead pointing back at them) are skipped.
//
// Usage:  npm run auto-convert:backfill   (or: node utils/migrateAutoConvert.js)

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const ContactForm = require('../models/ContactForm');
const Visit = require('../models/Visit');
const {
  ensureLeadFromContactForm,
  ensureLeadFromVisit,
} = require('./leadAutoConversion');

const backfillContactForms = async () => {
  // Anything not yet carrying a convertedLead is a candidate. The service
  // itself re-checks dedup, so re-runs are safe.
  const forms = await ContactForm.find({ convertedLead: null }).sort({ createdAt: 1 });

  console.log(`\nContact forms to process: ${forms.length}`);
  let created = 0;
  let linked = 0;
  let skipped = 0;
  let failed = 0;

  for (const form of forms) {
    try {
      const result = await ensureLeadFromContactForm({ contactForm: form, actor: null });
      if (result.created) {
        created += 1;
        console.log(`  ✓ Created lead from contact form ${form._id} (${form.email})`);
      } else if (result.deduped) {
        linked += 1;
        console.log(`  ↳ Linked contact form ${form._id} onto existing lead ${result.lead._id}`);
      } else {
        skipped += 1;
      }
    } catch (err) {
      failed += 1;
      console.error(`  ✗ Failed for contact form ${form._id}: ${err.message}`);
    }
  }

  console.log(`Contact form backfill done: ${created} leads created, ${linked} linked to existing leads, ${failed} failed.`);
  return { created, linked, failed };
};

const backfillVisits = async () => {
  const visits = await Visit.find({ convertedLead: null }).sort({ createdAt: 1 });

  console.log(`\nVisits to process: ${visits.length}`);
  let created = 0;
  let linked = 0;
  let failed = 0;

  for (const visit of visits) {
    try {
      const result = await ensureLeadFromVisit({ visit, actor: null });
      if (result.created) {
        created += 1;
        console.log(`  ✓ Created lead from visit ${visit._id} (${visit.visitType})`);
      } else if (result.deduped) {
        linked += 1;
        console.log(`  ↳ Linked visit ${visit._id} onto existing lead ${result.lead._id}`);
      }
    } catch (err) {
      failed += 1;
      console.error(`  ✗ Failed for visit ${visit._id}: ${err.message}`);
    }
  }

  console.log(`Visit backfill done: ${created} leads created, ${linked} linked to existing leads, ${failed} failed.`);
  return { created, linked, failed };
};

const run = async () => {
  await connectDB();
  console.log('=== Auto-conversion backfill: contact forms + visits -> leads ===');
  const formStats = await backfillContactForms();
  const visitStats = await backfillVisits();
  console.log('--------------------------------------------------');
  console.log(
    `TOTAL: ${formStats.created + visitStats.created} leads created, ` +
      `${formStats.linked + visitStats.linked} records linked onto existing leads, ` +
      `${formStats.failed + visitStats.failed} failures.`
  );
  await mongoose.disconnect();
  process.exit(0);
};

// Only execute when run directly (node utils/migrateAutoConvert.js) - never
// on require, so smoke tests and other tooling can import it safely.
if (require.main === module) {
  run().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}

module.exports = { backfillContactForms, backfillVisits };
