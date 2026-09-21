import React, { useEffect, useMemo, useState } from "react";
import { useToast } from "../../context/ToastContext";
import { useConfirm } from "../../context/ConfirmContext";
import {
  listArchives,
  getArchive,
  restoreArchive,
  getJobHistory,
  runJob,
} from "../../services/archiveService";

const TYPE_LABEL = {
  property: "Property",
  sale: "Sale",
  rental: "Rental",
  emiPlan: "EMI Plan",
};

const TYPE_FILTERS = [
  { value: "", label: "All" },
  { value: "property", label: "Properties" },
  { value: "sale", label: "Sales" },
  { value: "rental", label: "Rentals" },
  { value: "emiPlan", label: "EMI Plans" },
];

// Every job carries its schedule, retention window and a plain-language
// explainer so admins know what it does without reading server code.
// Thresholds marked (env) can be overridden with the named env variable.
const JOBS = [
  {
    key: "archive_emi_plans",
    group: "archive",
    label: "Archive EMI Plans",
    description: "Moves settled EMI plans (completed / cancelled / defaulted, past the age threshold) to cold storage.",
    schedule: "Weekly · Sun 02:00",
    retention: "365 days after settled",
    details:
      "Runs as part of the weekly archival pass. Picks up EMI plans whose status is completed, cancelled or defaulted and which haven't changed for 365 days (EMI_PLAN_ARCHIVE_AFTER_DAYS). Each plan is snapshotted into the Archive collection and then removed from the live collection, so lists stay fast. Restorable any time from the Archive Browser below.",
  },
  {
    key: "archive_sales",
    group: "archive",
    label: "Archive Sales",
    description: "Moves settled sales (verified / rejected, past the age threshold) to cold storage — skips any still linked to a live EMI plan.",
    schedule: "Weekly · Sun 02:00",
    retention: "365 days after settled",
    details:
      "Runs as part of the weekly archival pass. Picks up sales with status verified or rejected that haven't changed for 365 days (SALE_ARCHIVE_AFTER_DAYS). A sale still referenced by a live EMI plan is skipped, never orphaned. Snapshotted to cold storage first, so nothing is lost — restore from the Archive Browser below.",
  },
  {
    key: "archive_rentals",
    group: "archive",
    label: "Archive Rentals",
    description: "Moves settled rentals (verified / rejected, past the age threshold) to cold storage.",
    schedule: "Weekly · Sun 02:00",
    retention: "365 days after settled",
    details:
      "Runs as part of the weekly archival pass. Picks up rentals with status verified or rejected that haven't changed for 365 days (RENTAL_ARCHIVE_AFTER_DAYS). Rentals are leaf records (nothing references them), so every match is archived. Snapshotted first — restorable from the Archive Browser below.",
  },
  {
    key: "archive_properties",
    group: "archive",
    label: "Archive Properties",
    description: "Moves soft-archived listings (past the age threshold since archiving) to cold storage — skips any still linked to a live sale.",
    schedule: "Weekly · Sun 02:00",
    retention: "90 days after archiving",
    details:
      "Runs as part of the weekly archival pass. Only listings already soft-archived by an admin (isArchived) and untouched for 90 days (PROPERTY_COLD_STORAGE_AFTER_DAYS) qualify. A property still linked to a live sale or rental is skipped. Snapshotted to cold storage first — restorable from the Archive Browser below.",
  },
  {
    key: "cleanup_contact_forms",
    group: "retention",
    label: "Cleanup Contact Forms",
    description: "Permanently deletes contact form submissions past their retention window — skips anything converted to, or still linked from, a lead.",
    schedule: "Nightly · 03:00",
    retention: "30 days after submission",
    details:
      "Runs in the nightly retention pass. Permanently deletes submissions older than 30 days (CONTACT_FORM_RETENTION_DAYS). Anything converted into a lead, or still referenced by one, is skipped — the lead is the record of truth from that point on. Deletions are permanent and cannot be restored; use Dry Run first to preview the count.",
  },
  {
    key: "cleanup_conversations",
    group: "retention",
    label: "Cleanup Conversations",
    description: "Permanently deletes closed conversation threads past their retention window — skips anything still linked from a lead.",
    schedule: "Nightly · 03:00",
    retention: "30 days after closing",
    details:
      "Runs in the nightly retention pass. Permanently deletes threads that are closed (inactive) and untouched for 30 days (CONVERSATION_RETENTION_DAYS) — closing a thread resets the clock. Threads still linked from a lead's conversation history are skipped. Deletions are permanent and cannot be restored; use Dry Run first.",
  },
  {
    key: "cleanup_verification_docs",
    group: "retention",
    label: "Cleanup Verification Docs",
    description: "Unlinks ID photos (selfie / citizenship) from long-deactivated accounts — the account itself is kept.",
    schedule: "Nightly · 03:30",
    retention: "90 days after deactivation",
    details:
      "Runs in the nightly retention pass. For accounts deactivated for 90 days (VERIFICATION_DOCS_RETENTION_DAYS) that still hold identity photos, it deletes the files from cloud storage (best effort) and clears the photo fields. The user record itself is never deleted. Unlinked photos cannot be recovered.",
  },
];

// Notification sweeps. These run on their own cron timers, notify at most
// once per recipient per day (deduplicated), and intentionally write no job
// history — there is nothing destructive to audit, so they are info-only.
const REMINDER_JOBS = [
  {
    key: "emi_reminders",
    automaticOnly: true,
    label: "EMI Installment Reminders",
    schedule: "Daily · 08:00",
    description: "Notifies buyers (and their agents) about installments due within 3 days or already overdue.",
    details:
      "Scans active EMI plans every morning: installments due in the next 3 days trigger a due-soon notice, past-due ones an overdue notice. Buyer messages include the NPR amount and link to /my-emi; agents get a schedule-only copy. At most one notice per person per plan per day — re-running changes nothing.",
  },
  {
    key: "lead_followup_reminders",
    automaticOnly: true,
    label: "Lead Follow-up Reminders",
    description: "Nudges the assigned agent (or all admins for unassigned leads) about overdue follow-ups.",
    schedule: "Daily · 09:00",
    details:
      "Scans leads with a follow-up date in the past on an open stage (not closed / lost). The assigned agent is notified; leads with no agent notify every admin instead. At most one nudge per lead per day — re-running changes nothing.",
  },
];

const fmtDate = (d) => (d ? new Date(d).toLocaleString() : "—");

const chipClass = (active) =>
  `text-xs font-semibold uppercase tracking-wider px-3.5 py-1.5 rounded-sm border transition-colors ${
    active
      ? "bg-navy text-ivory border-navy"
      : "bg-white text-slate-muted border-navy/15 hover:border-navy/40"
  }`;

// ------------------------------------------------------------------
// Job control card (runnable jobs + automatic-only reminder jobs)
// ------------------------------------------------------------------
const JobCard = ({ job, lastRun, busy, onRun }) => {
  const [showInfo, setShowInfo] = useState(false);
  const isDestructive = job.group === "retention";
  const automaticOnly = job.automaticOnly === true;
  const infoText = job.details || job.description;
  return (
    <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-medium text-navy">
          {job.label}{" "}
          <button
            type="button"
            onClick={() => setShowInfo((s) => !s)}
            aria-label={showInfo ? `Hide details for ${job.label}` : `What does ${job.label} do?`}
            aria-expanded={showInfo}
            title={infoText}
            className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-navy/20 text-slate-muted hover:text-navy hover:border-navy/40 text-[11px] font-semibold align-middle"
          >
            {showInfo ? "×" : "ⓘ"}
          </button>
        </p>
        <span
          className={`status-badge flex-shrink-0 ${
            automaticOnly
              ? "bg-brass/15 text-brass-dark"
              : job.group === "archive"
                ? "bg-navy/10 text-navy"
                : "bg-brick-light text-brick"
          }`}
        >
          {automaticOnly ? "Automatic" : job.group === "archive" ? "Cold storage" : "Hard delete"}
        </span>
      </div>
      <p className="text-xs text-slate-muted mb-2" title={infoText}>{job.description}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4 text-xs">
        <span className="text-slate-muted" title="How often this job runs on its own">
          🕒 <span className="text-slate-ink font-medium">{job.schedule}</span>
        </span>
        {job.retention && (
          <span className="text-slate-muted" title="How old a record must be before this job touches it">
            📦 <span className="text-slate-ink font-medium">{job.retention}</span>
          </span>
        )}
      </div>
      {showInfo && (
        <p className="text-xs text-slate-ink bg-parchment/60 border border-navy/10 rounded-sm p-3 mb-4 leading-relaxed">
          {infoText}
        </p>
      )}

      {automaticOnly ? (
        <p className="text-xs text-slate-muted border-t border-navy/10 pt-3">
          Runs on its own schedule — nothing to trigger, and nothing destructive to preview.
        </p>
      ) : (
        <>
          {lastRun ? (
            <div className="text-xs text-slate-muted mb-4 border-t border-navy/10 pt-3">
              <div className="flex justify-between gap-3 mb-1">
                <span>Last run</span>
                <span className="text-slate-ink">
                  {fmtDate(lastRun.createdAt)} {lastRun.dryRun && <span className="text-brass-dark">(dry run)</span>}
                </span>
              </div>
              <div className="flex justify-between gap-3 mb-1">
                <span>Processed / Affected / Skipped</span>
                <span className="text-slate-ink">
                  {lastRun.processed} / {lastRun.affected} / {lastRun.skipped}
                </span>
              </div>
              {lastRun.errors?.length > 0 && (
                <p className="text-brick mt-1">{lastRun.errors.length} error(s) — see job history below</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-muted mb-4 border-t border-navy/10 pt-3">Never run yet.</p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onRun(job, true)}
              disabled={busy}
              className="btn-secondary text-xs px-3 py-1.5 flex-1"
            >
              Dry Run
            </button>
            <button
              type="button"
              onClick={() => onRun(job, false)}
              disabled={busy}
              className={`text-xs px-3 py-1.5 flex-1 rounded-sm font-medium ${
                isDestructive ? "bg-brick text-ivory hover:bg-brick/90" : "btn-primary"
              }`}
            >
              Run Now
            </button>
          </div>
        </>
      )}
    </div>
  );
};

// ------------------------------------------------------------------
// Archive detail modal
// ------------------------------------------------------------------
const ArchiveDetailModal = ({ item, onClose, onRestore, busy }) => {
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getArchive(item._id)
      .then((data) => {
        if (!cancelled) setFull(data.archive);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || "Failed to load archived record");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item._id]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy-dark/60" onClick={onClose} />
      <div className="relative bg-white rounded-sm shadow-lifted w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="eyebrow mb-1">{TYPE_LABEL[item.entityType] || item.entityType}</p>
            <h2 className="font-display text-xl text-navy">{item.summary?.title || "Archived record"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-muted hover:text-navy text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Archived At</p>
            <p className="text-navy">{fmtDate(item.archivedAt)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Original ID</p>
            <p className="text-navy break-all">{item.originalId}</p>
          </div>
          <div className="col-span-2">
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Reason</p>
            <p className="text-navy">{item.reason || "—"}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-slate-muted text-sm">Loading full snapshot...</p>
        ) : error ? (
          <div className="bg-brick-light border border-brick/30 text-brick rounded-sm p-3 text-sm">{error}</div>
        ) : (
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Full Snapshot</p>
            <pre className="bg-parchment/60 border border-navy/10 rounded-sm p-4 text-xs overflow-x-auto max-h-72 whitespace-pre-wrap break-words">
              {JSON.stringify(full?.data, null, 2)}
            </pre>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 py-2">
            Close
          </button>
          {!item.restoredAt && (
            <button
              type="button"
              onClick={() => onRestore(item)}
              disabled={busy}
              className="btn-primary text-sm px-4 py-2"
            >
              {busy ? "Restoring..." : "Restore"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------
// Main page
// ------------------------------------------------------------------
export default function DataArchives() {
  const { showToast } = useToast();
  const { confirm } = useConfirm();

  const [jobHistory, setJobHistory] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [runningJob, setRunningJob] = useState(null); // job key currently running

  const [typeFilter, setTypeFilter] = useState("");
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, currentPage: 1 });
  const [page, setPage] = useState(1);
  const [archivesLoading, setArchivesLoading] = useState(true);
  const [archivesError, setArchivesError] = useState("");

  const [selected, setSelected] = useState(null);
  const [restoreBusy, setRestoreBusy] = useState(false);

  const lastRunByJob = useMemo(() => {
    const map = {};
    jobHistory.forEach((log) => {
      if (!map[log.job]) map[log.job] = log; // logs come back newest-first
    });
    return map;
  }, [jobHistory]);

  const loadJobHistory = async () => {
    setJobsLoading(true);
    try {
      const data = await getJobHistory({ limit: 50 });
      setJobHistory(data.logs || []);
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to load job history", "error");
    } finally {
      setJobsLoading(false);
    }
  };

  const loadArchives = async () => {
    setArchivesLoading(true);
    try {
      const data = await listArchives({ type: typeFilter || undefined, page, limit: 15 });
      setItems(data.items || []);
      setPagination(data.pagination || { total: 0, pages: 1, currentPage: 1 });
      setArchivesError("");
    } catch (err) {
      setArchivesError(err.response?.data?.message || "Failed to load archives");
    } finally {
      setArchivesLoading(false);
    }
  };

  useEffect(() => {
    loadJobHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadArchives();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, page]);

  const handleRunJob = async (job, dryRun) => {
    if (!dryRun) {
      const confirmed = await confirm({
        title: `Run "${job.label}" now?`,
        message:
          job.group === "retention"
            ? "This will permanently delete matching records. This cannot be undone."
            : "This will move matching records to cold storage and remove them from their live collection.",
        confirmLabel: "Yes, run it",
        cancelLabel: "Cancel",
      });
      if (!confirmed) return;
    }

    setRunningJob(job.key);
    try {
      const data = await runJob(job.key, dryRun);
      const r = data.result;
      showToast(
        dryRun
          ? `Dry run: ${r.processed} matched, ${r.affected} would be affected, ${r.skipped} would be skipped`
          : `${job.label}: ${r.affected} affected, ${r.skipped} skipped`,
        "success"
      );
      await loadJobHistory();
      if (!dryRun && job.group === "archive") await loadArchives();
    } catch (err) {
      showToast(err.response?.data?.message || "Job failed to run", "error");
    } finally {
      setRunningJob(null);
    }
  };

  const handleRestore = async (item) => {
    const confirmed = await confirm({
      title: "Restore this record?",
      message: `This will move the ${TYPE_LABEL[item.entityType] || item.entityType} back into its live collection.`,
      confirmLabel: "Yes, restore it",
      cancelLabel: "Cancel",
    });
    if (!confirmed) return;

    setRestoreBusy(true);
    try {
      await restoreArchive(item._id);
      showToast("Record restored", "success");
      setSelected(null);
      await loadArchives();
    } catch (err) {
      showToast(err.response?.data?.message || "Failed to restore record", "error");
    } finally {
      setRestoreBusy(false);
    }
  };

  return (
    <div>
      <p className="eyebrow mb-2">Admin</p>
      <h1 className="text-3xl mb-2">Archives & Data Jobs</h1>
      <p className="text-sm text-slate-muted mb-8">
        Cold-storage archival for settled properties, sales, rentals and EMI plans, plus hard-delete retention for
        closed conversations, contact form submissions and stale verification photos. Hover the ⓘ on any card —
        or click it — for exactly what it does, when it runs, and how old a record must be.
      </p>

      {/* Job controls */}
      <h2 className="text-lg font-medium text-navy mb-4">Cold Storage — Archival Jobs</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {JOBS.filter((j) => j.group === "archive").map((job) => (
          <JobCard
            key={job.key}
            job={job}
            lastRun={lastRunByJob[job.key]}
            busy={runningJob === job.key}
            onRun={handleRunJob}
          />
        ))}
      </div>

      <h2 className="text-lg font-medium text-navy mb-4">Hard-Delete — Retention Jobs</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {JOBS.filter((j) => j.group === "retention").map((job) => (
          <JobCard
            key={job.key}
            job={job}
            lastRun={lastRunByJob[job.key]}
            busy={runningJob === job.key}
            onRun={handleRunJob}
          />
        ))}
      </div>

      <h2 className="text-lg font-medium text-navy mb-4">Automatic — Reminder Jobs</h2>
      <p className="text-xs text-slate-muted mb-4">
        Notification sweeps that run on their own timers. They only send reminders (never change or delete data),
        so there is nothing to preview or trigger — listed here so you know they exist.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
        {REMINDER_JOBS.map((job) => (
          <JobCard key={job.key} job={job} lastRun={null} busy={false} onRun={() => {}} />
        ))}
      </div>

      {/* Job history */}
      <h2 className="text-lg font-medium text-navy mb-4">Recent Job History</h2>
      {jobsLoading ? (
        <p className="text-slate-muted mb-10">Loading job history...</p>
      ) : jobHistory.length === 0 ? (
        <div className="bg-white border border-navy/10 rounded-sm py-10 px-6 text-center mb-10">
          <p className="text-slate-muted">No jobs have run yet.</p>
        </div>
      ) : (
        <div className="bg-white border border-navy/10 rounded-sm overflow-x-auto shadow-card mb-10">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-muted border-b border-navy/10">
                <th className="px-5 py-3">Job</th>
                <th className="px-5 py-3">Ran At</th>
                <th className="px-5 py-3">Mode</th>
                <th className="px-5 py-3">Processed</th>
                <th className="px-5 py-3">Affected</th>
                <th className="px-5 py-3">Skipped</th>
                <th className="px-5 py-3">Errors</th>
              </tr>
            </thead>
            <tbody>
              {jobHistory.map((log) => (
                <tr key={log._id} className="border-b border-navy/5 last:border-0">
                  <td className="px-5 py-3 text-navy font-medium">
                    {JOBS.find((j) => j.key === log.job)?.label || log.job}
                  </td>
                  <td className="px-5 py-3 text-slate-muted">{fmtDate(log.createdAt)}</td>
                  <td className="px-5 py-3">
                    <span className={`status-badge ${log.dryRun ? "bg-brass/15 text-brass-dark" : "bg-navy/10 text-navy"}`}>
                      {log.dryRun ? "Dry run" : "Live"}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-ink">{log.processed}</td>
                  <td className="px-5 py-3 text-slate-ink">{log.affected}</td>
                  <td className="px-5 py-3 text-slate-ink">{log.skipped}</td>
                  <td className="px-5 py-3">
                    {log.errors?.length > 0 ? (
                      <span className="status-badge bg-brick-light text-brick">{log.errors.length}</span>
                    ) : (
                      <span className="text-slate-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Archive browser */}
      <h2 className="text-lg font-medium text-navy mb-4">Archive Browser</h2>
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setTypeFilter(f.value);
              setPage(1);
            }}
            className={chipClass(typeFilter === f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {archivesError && !archivesLoading && (
        <div className="bg-brick-light border border-brick/30 text-brick rounded-sm p-4 mb-6 text-sm">{archivesError}</div>
      )}

      {archivesLoading ? (
        <p className="text-slate-muted">Loading archives...</p>
      ) : items.length === 0 && !archivesError ? (
        <div className="bg-white border border-navy/10 rounded-sm py-16 px-6 text-center">
          <p className="text-slate-muted">No archived records{typeFilter ? ` of type "${TYPE_LABEL[typeFilter]}"` : ""} yet.</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-navy/10 rounded-sm overflow-x-auto shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-muted border-b border-navy/10">
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Summary</th>
                  <th className="px-5 py-3">Archived At</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id} className="border-b border-navy/5 last:border-0">
                    <td className="px-5 py-3">
                      <span className="status-badge bg-navy/10 text-navy">{TYPE_LABEL[item.entityType] || item.entityType}</span>
                    </td>
                    <td className="px-5 py-3 text-navy font-medium max-w-[260px] truncate">{item.summary?.title || "—"}</td>
                    <td className="px-5 py-3 text-slate-muted">{fmtDate(item.archivedAt)}</td>
                    <td className="px-5 py-3 text-slate-muted max-w-[240px] truncate">{item.reason || "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <button type="button" onClick={() => setSelected(item)} className="btn-secondary text-xs px-3 py-1.5">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
              >
                Previous
              </button>
              <p className="text-xs text-slate-muted">
                Page {pagination.currentPage} of {pagination.pages} · {pagination.total} total
              </p>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {selected && (
        <ArchiveDetailModal
          item={selected}
          busy={restoreBusy}
          onClose={() => setSelected(null)}
          onRestore={handleRestore}
        />
      )}
    </div>
  );
}
