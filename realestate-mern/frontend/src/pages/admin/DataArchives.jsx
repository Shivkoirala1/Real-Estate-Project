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
  emiPlan: "EMI Plan",
};

const TYPE_FILTERS = [
  { value: "", label: "All" },
  { value: "property", label: "Properties" },
  { value: "sale", label: "Sales" },
  { value: "emiPlan", label: "EMI Plans" },
];

const JOBS = [
  {
    key: "archive_emi_plans",
    group: "archive",
    label: "Archive EMI Plans",
    description: "Moves settled EMI plans (completed / cancelled / defaulted, past the age threshold) to cold storage.",
  },
  {
    key: "archive_sales",
    group: "archive",
    label: "Archive Sales",
    description: "Moves settled sales (verified / rejected, past the age threshold) to cold storage — skips any still linked to a live EMI plan.",
  },
  {
    key: "archive_properties",
    group: "archive",
    label: "Archive Properties",
    description: "Moves soft-archived listings (past the age threshold since archiving) to cold storage — skips any still linked to a live sale.",
  },
  {
    key: "cleanup_contact_forms",
    group: "retention",
    label: "Cleanup Contact Forms",
    description: "Permanently deletes contact form submissions past their retention window — skips anything converted to, or still linked from, a lead.",
  },
  {
    key: "cleanup_conversations",
    group: "retention",
    label: "Cleanup Conversations",
    description: "Permanently deletes closed conversation threads past their retention window — skips anything still linked from a lead.",
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
// Job control card
// ------------------------------------------------------------------
const JobCard = ({ job, lastRun, busy, onRun }) => {
  const isDestructive = job.group === "retention";
  return (
    <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-medium text-navy">{job.label}</p>
        <span
          className={`status-badge flex-shrink-0 ${
            job.group === "archive" ? "bg-navy/10 text-navy" : "bg-brick-light text-brick"
          }`}
        >
          {job.group === "archive" ? "Cold storage" : "Hard delete"}
        </span>
      </div>
      <p className="text-xs text-slate-muted mb-4">{job.description}</p>

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
        Cold-storage archival for settled properties, sales and EMI plans, plus hard-delete retention for closed
        conversations and contact form submissions.
      </p>

      {/* Job controls */}
      <h2 className="text-lg font-medium text-navy mb-4">Cold Storage — Archival Jobs</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
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
