const mongoose = require('mongoose');

/**
 * DataOpsLog - one row per run of an archival or data-retention job, so
 * admins can see what an automated job did (or failed to do) without
 * digging through server logs. Kept small and append-only; this
 * collection is itself capped by a TTL below (its own history doesn't
 * need to live forever).
 */
const dataOpsLogSchema = new mongoose.Schema(
  {
    job: {
      type: String,
      enum: ['archive_properties', 'archive_sales', 'archive_emi_plans', 'cleanup_contact_forms', 'cleanup_conversations'],
      required: true,
    },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    dryRun: { type: Boolean, default: false },
    processed: { type: Number, default: 0 }, // records matched the eligibility criteria
    affected: { type: Number, default: 0 },  // records actually archived/deleted
    skipped: { type: Number, default: 0 },   // matched but protected by a referential-integrity guard
    errors: [{ type: String }],
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = scheduled cron
  },
  { timestamps: true }
);

dataOpsLogSchema.index({ job: 1, createdAt: -1 });
// Keep 180 days of job history - plenty for auditing a nightly/weekly job, no reason to keep it forever
dataOpsLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

module.exports = mongoose.model('DataOpsLog', dataOpsLogSchema);
