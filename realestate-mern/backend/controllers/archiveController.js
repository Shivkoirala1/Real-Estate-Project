const Archive = require('../models/Archive');
const DataOpsLog = require('../models/DataOpsLog');
const asyncHandler = require('../utils/asyncHandler');
const archival = require('../utils/archival');
const dataRetention = require('../utils/dataRetention');

/**
 * @desc    List archived records (cold storage), newest first
 * @route   GET /api/admin/archives?type=property|sale|emiPlan&page=&limit=
 * @access  Private (admin)
 */
const listArchives = asyncHandler(async (req, res) => {
  const { type, page = 1, limit = 20 } = req.query;
  const query = {};
  if (type) {
    if (!Archive.TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: `type must be one of: ${Archive.TYPES.join(', ')}` });
    }
    query.entityType = type;
  }
  // Only show currently-archived (not-yet-restored) records by default
  if (req.query.includeRestored !== 'true') {
    query.restoredAt = null;
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

  const [items, total] = await Promise.all([
    Archive.find(query)
      .select('-data') // list view: never ship the full snapshot payload
      .sort({ archivedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    Archive.countDocuments(query),
  ]);

  res.json({
    success: true,
    count: items.length,
    pagination: { total, pages: Math.ceil(total / limitNum), currentPage: pageNum, limit: limitNum },
    items,
  });
});

/**
 * @desc    View one archived record's full snapshot
 * @route   GET /api/admin/archives/:id
 * @access  Private (admin)
 */
const getArchive = asyncHandler(async (req, res) => {
  const archived = await Archive.findById(req.params.id);
  if (!archived) return res.status(404).json({ success: false, message: 'Archived record not found' });
  res.json({ success: true, archive: archived });
});

/**
 * @desc    Restore an archived record back into its live collection
 * @route   POST /api/admin/archives/:id/restore
 * @access  Private (admin)
 */
const restoreArchive = asyncHandler(async (req, res) => {
  try {
    const restored = await archival.restoreArchived(req.params.id, req.user._id);
    res.json({ success: true, message: 'Record restored', record: restored });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
});

/**
 * @desc    Recent archival / retention job runs (for an ops dashboard)
 * @route   GET /api/admin/archives/jobs/history?job=&limit=
 * @access  Private (admin)
 */
const jobHistory = asyncHandler(async (req, res) => {
  const { job, limit = 30 } = req.query;
  const query = {};
  if (job) query.job = job;
  const logs = await DataOpsLog.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(100, Math.max(1, parseInt(limit, 10) || 30)));
  res.json({ success: true, count: logs.length, logs });
});

const ARCHIVAL_JOBS = {
  archive_emi_plans: archival.archiveEmiPlans,
  archive_sales: archival.archiveSales,
  archive_properties: archival.archiveProperties,
};
const RETENTION_JOBS = {
  cleanup_contact_forms: dataRetention.cleanupContactForms,
  cleanup_conversations: dataRetention.cleanupConversations,
};

/**
 * @desc    Manually run one archival/retention job on demand, e.g. to
 *          verify behaviour with dryRun=true before trusting the schedule.
 * @route   POST /api/admin/archives/jobs/:job/run?dryRun=true
 * @access  Private (admin)
 */
const runJobNow = asyncHandler(async (req, res) => {
  const { job } = req.params;
  const dryRun = req.query.dryRun === 'true';
  const runner = ARCHIVAL_JOBS[job] || RETENTION_JOBS[job];
  if (!runner) {
    return res.status(400).json({
      success: false,
      message: `Unknown job. Must be one of: ${[...Object.keys(ARCHIVAL_JOBS), ...Object.keys(RETENTION_JOBS)].join(', ')}`,
    });
  }

  const startedAt = new Date();
  const result = await runner({ dryRun, actorId: req.user._id });
  const finishedAt = new Date();
  const log = await DataOpsLog.create({
    job,
    startedAt,
    finishedAt,
    dryRun,
    processed: result.processed,
    affected: result.affected,
    skipped: result.skipped,
    errors: result.errors,
    triggeredBy: req.user._id,
  });

  res.json({ success: true, message: dryRun ? 'Dry run complete - nothing was changed' : 'Job complete', result, log });
});

module.exports = { listArchives, getArchive, restoreArchive, jobHistory, runJobNow };
