import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getManagementRequestById,
  getActivities,
  acceptRequest,
  declineRequest,
  terminateManagement,
  approveTermination,
  requestTermination,
  addActivity,
} from '../../../services/propertyManagementService';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { useConfirm } from '../../../context/ConfirmContext';
import ManagementStatusBadge from '../../../components/PropertyManagement/ManagementStatusBadge';
import ManagementActivityTimeline from '../../../components/PropertyManagement/ManagementActivityTimeline';

const ACTIVITY_PAGE_SIZE = 20;

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Compares an id-ish value (raw ObjectId string, or populated doc) with another.
const sameId = (a, b) => {
  if (!a || !b) return false;
  const left = typeof a === 'object' ? a._id || a : a;
  const right = typeof b === 'object' ? b._id || b : b;
  return String(left) === String(right);
};

const REASON_META = {
  decline: {
    title: 'Decline this management request?',
    label: 'Decline reason *',
    placeholder: 'Tell the owner why this request cannot be accepted...',
    confirmLabel: 'Decline request',
    dialog: {
      title: 'Decline this management request?',
      message: 'The owner will see the decline reason. This decision cannot be undone.',
      confirmLabel: 'Yes, decline it',
      tone: 'danger',
    },
    toast: 'Management request declined',
    failToast: 'Failed to decline request',
  },
  terminate: {
    title: 'Terminate this management?',
    label: 'Termination reason *',
    placeholder: 'Why is this management arrangement being terminated?',
    confirmLabel: 'Terminate management',
    dialog: {
      title: 'Terminate this management?',
      message: 'The management will be terminated immediately. This cannot be undone.',
      confirmLabel: 'Yes, terminate it',
      tone: 'danger',
    },
    toast: 'Management terminated',
    failToast: 'Failed to terminate management',
  },
  request_termination: {
    title: 'Request termination of this management?',
    label: 'Reason (optional)',
    placeholder: 'Why do you want to end this management arrangement?',
    confirmLabel: 'Send request',
    dialog: {
      title: 'Request termination?',
      message: 'Your reason is sent to the admin, who makes the final decision. Once submitted, you cannot reverse this request.',
      confirmLabel: 'Yes, send it',
      tone: 'danger',
    },
    toast: 'Termination request sent to the admin',
    failToast: 'Failed to send termination request',
  },
};

// Shared reason mini-modal used by decline / terminate / request-termination.
// request_termination reason is optional; decline/terminate require one.
const ReasonModal = ({ meta, optional, value, error, submitting, onChange, onSubmit, onClose }) => {
  // Close on Escape, consistent with the other management modals.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reason-modal-title"
    >
    <div className="absolute inset-0 bg-navy/60" onClick={onClose} />
    <div className="relative bg-white rounded-sm shadow-lifted max-w-md w-full p-6">
      <h2 id="reason-modal-title" className="font-display text-xl text-navy mb-2">
        {meta.title}
      </h2>
      <label htmlFor="reason-modal-input" className="label-field">
        {meta.label}
      </label>
      <textarea
        id="reason-modal-input"
        rows={3}
        autoFocus
        value={value}
        onChange={onChange}
        placeholder={meta.placeholder}
        className={`input-field resize-none ${error ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
      />
      {error && <p className="text-xs text-brick mt-1">{error}</p>}
      <div className="flex justify-end gap-3 mt-5">
        <button type="button" onClick={onClose} className="btn-secondary text-sm px-4 py-2">
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="btn-primary text-sm px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Working...' : meta.confirmLabel}
        </button>
      </div>
    </div>
    </div>
  );
};

// ROLE-AWARE detail page for one management request. Capabilities are decided
// from useAuth() + the populated request owner id.
const ManagementRequestDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [request, setRequest] = useState(null);
  const [activities, setActivities] = useState([]);
  const [activityPagination, setActivityPagination] = useState({
    page: 1,
    limit: ACTIVITY_PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [busy, setBusy] = useState(false); // any lifecycle mutation in flight
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [reasonModal, setReasonModal] = useState(null); // 'decline' | 'terminate' | 'request_termination'
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const loadRequest = useCallback(async () => {
    try {
      const data = await getManagementRequestById(id);
      setRequest(data.request || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load request');
    }
  }, [id]);

  const loadActivities = useCallback(async () => {
    try {
      const data = await getActivities(id, { page: 1, limit: ACTIVITY_PAGE_SIZE });
      setActivities(data.activities || []);
      setActivityPagination(
        data.pagination || { page: 1, limit: ACTIVITY_PAGE_SIZE, total: 0, totalPages: 1 }
      );
    } catch {
      // Timeline is secondary — the page still renders without it.
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    const boot = async () => {
      setLoading(true);
      setError('');
      await Promise.all([loadRequest(), loadActivities()]);
      if (active) setLoading(false);
    };
    boot();
    return () => {
      active = false;
    };
  }, [loadRequest, loadActivities]);

  // Re-fetch request + timeline after every mutation.
  const refreshAll = useCallback(async () => {
    await Promise.all([loadRequest(), loadActivities()]);
  }, [loadRequest, loadActivities]);

  // ---------- role flags ----------
  const isAdmin = user?.role === 'admin';
  const isOwner = sameId(request?.owner, user?._id);
  const backLink = isAdmin
    ? '/dashboard/admin/property-management'
    : isOwner
      ? '/my-properties/management'
      : null;
  const canAddNote = isAdmin || isOwner;

  // ---------- lifecycle handlers ----------
  const handleAccept = async () => {
    const ok = await confirm({
      title: 'Accept this management request?',
      message: 'The request becomes active immediately. This decision cannot be undone.',
      confirmLabel: 'Accept',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await acceptRequest(id);
      showToast('Management request accepted - now active');
      await refreshAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to accept request', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleApproveTermination = async () => {
    const ok = await confirm({
      title: 'Approve this termination?',
      message: 'The management will be terminated immediately. This cannot be undone.',
      confirmLabel: 'Approve termination',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await approveTermination(id);
      showToast('Termination approved - management terminated');
      await refreshAll();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to approve termination', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openReason = (kind) => {
    setReasonModal(kind);
    setReason('');
    setReasonError('');
  };
  const closeReason = () => {
    setReasonModal(null);
    setReason('');
    setReasonError('');
  };

  const handleReasonChange = (e) => {
    setReason(e.target.value);
    if (reasonError) setReasonError('');
  };

  const submitReason = async () => {
    const kind = reasonModal;
    if (!kind) return;
    const needsReason = kind !== 'request_termination';
    if (needsReason && !reason.trim()) {
      setReasonError('A reason is required');
      return;
    }
    const meta = REASON_META[kind];
    const ok = await confirm(meta.dialog);
    if (!ok) return;
    setBusy(true);
    try {
      if (kind === 'decline') await declineRequest(id, reason.trim());
      else if (kind === 'terminate') await terminateManagement(id, reason.trim());
      else if (kind === 'request_termination') await requestTermination(id, reason.trim());
      showToast(meta.toast);
      closeReason();
      await refreshAll();
    } catch (err) {
      showToast(err.response?.data?.message || meta.failToast, 'error');
    } finally {
      setBusy(false);
    }
  };

  // ---------- notes ----------
  const handleAddNote = async () => {
    if (!note.trim() || noteBusy) return;
    setNoteBusy(true);
    try {
      const data = await addActivity(id, note.trim());
      if (data.activity) {
        // Timeline is newest-first — prepend the returned activity.
        setActivities((prev) => [data.activity, ...prev]);
        setActivityPagination((prev) => ({ ...prev, total: prev.total + 1 }));
      }
      setNote('');
      showToast('Note added to timeline');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add note', 'error');
    } finally {
      setNoteBusy(false);
    }
  };

  // ---------- timeline pagination ----------
  const handleLoadMore = async () => {
    setLoadingMore(true);
    try {
      const next = activityPagination.page + 1;
      const data = await getActivities(id, { page: next, limit: ACTIVITY_PAGE_SIZE });
      setActivities((prev) => [...prev, ...(data.activities || [])]);
      setActivityPagination(
        data.pagination || { ...activityPagination, page: next }
      );
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load more activity', 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  // ---------- render ----------
  if (loading) {
    return <p className="text-sm text-slate-muted">Loading request...</p>;
  }

  if (error && !request) {
    return (
      <div>
        {backLink && (
          <Link to={backLink} className="text-sm text-slate-muted hover:text-navy">
            ← Back
          </Link>
        )}
        <div className="bg-brick-light border border-brick/30 text-brick rounded-sm px-5 py-4 text-sm font-medium mt-4 flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError('');
              setLoading(true);
              refreshAll().finally(() => setLoading(false));
            }}
            className="underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!request) return null;

  const property = request.property || {};
  const owner = request.owner || {};
  const services = request.services || [];

  return (
    <div>
      {backLink && (
        <Link
          to={backLink}
          className="inline-flex items-center gap-1.5 text-sm text-slate-muted hover:text-navy mb-4 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </Link>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <p className="eyebrow mb-2">Property Management</p>
          <h1 className="text-3xl mb-1">{property.title || 'Untitled property'}</h1>
          <p className="text-sm text-slate-muted">
            Requested {formatDate(request.createdAt)}
          </p>
        </div>
        <ManagementStatusBadge status={request.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: info + actions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-navy/10 rounded-sm shadow-card p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Owner</p>
                <p className="text-sm font-medium text-navy">{owner.name || '—'}</p>
                {owner.email && (
                  <a href={`mailto:${owner.email}`} className="text-xs text-brass hover:underline block mt-0.5">
                    {owner.email}
                  </a>
                )}
                {owner.phone && (
                  <a href={`tel:${owner.phone}`} className="text-xs text-slate-muted hover:text-navy block mt-0.5">
                    {owner.phone}
                  </a>
                )}
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Requested</p>
                <p className="text-sm font-medium text-navy">{formatDate(request.createdAt)}</p>
              </div>

              {request.decidedAt && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Decided</p>
                  <p className="text-sm font-medium text-navy">
                    {formatDate(request.decidedAt)}
                    {request.decidedBy?.name ? ` by ${request.decidedBy.name}` : ''}
                  </p>
                </div>
              )}

              {request.terminatedAt && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Terminated</p>
                  <p className="text-sm font-medium text-navy">{formatDate(request.terminatedAt)}</p>
                </div>
              )}
            </div>

            {/* Services */}
            <div className="border-t border-navy/5 pt-4 mt-5">
              <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Requested services</p>
              <div className="flex flex-wrap gap-2">
                {services.length === 0 ? (
                  <p className="text-sm text-slate-muted">—</p>
                ) : (
                  services.map((s) => (
                    <span
                      key={s}
                      className="text-xs font-medium bg-navy/10 text-navy px-2.5 py-1 rounded-sm"
                    >
                      {s}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Owner note */}
            {request.note && (
              <div className="border-t border-navy/5 pt-4 mt-4">
                <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Owner note</p>
                <p className="text-sm text-slate-ink whitespace-pre-line">{request.note}</p>
              </div>
            )}

            {/* Decline reason */}
            {request.status === 'declined' && request.decisionReason && (
              <div className="bg-brick-light border border-brick/20 rounded-sm px-4 py-3 mt-4 text-sm text-brick">
                <span className="font-medium">Decline reason:</span> {request.decisionReason}
                {request.decidedBy?.name && (
                  <span className="text-brick/80">
                    {' '}— decided by {request.decidedBy.name}
                  </span>
                )}
              </div>
            )}

            {/* Termination reasons */}
            {['termination_pending', 'terminated'].includes(request.status) && request.terminationReason && (
              <div className="bg-parchment border border-navy/10 rounded-sm px-4 py-3 mt-4 text-sm text-slate-ink">
                <span className="font-medium">Owner termination reason:</span> {request.terminationReason}
              </div>
            )}
            {request.status === 'terminated' && request.terminatedReason && (
              <div className="bg-brick-light border border-brick/20 rounded-sm px-4 py-3 mt-4 text-sm text-brick">
                <span className="font-medium">Termination reason:</span> {request.terminatedReason}
                {request.terminatedBy?.name && (
                  <span className="text-brick/80">
                    {' '}— terminated by {request.terminatedBy.name}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions — admin: pending → Accept / Decline */}
          {isAdmin && request.status === 'pending' && (
            <div className="bg-white border border-navy/10 rounded-sm shadow-card p-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleAccept}
                disabled={busy}
                className="btn-primary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? 'Working...' : 'Accept'}
              </button>
              <button
                type="button"
                onClick={() => openReason('decline')}
                disabled={busy}
                className="border border-brick text-brick text-sm font-medium px-5 py-2.5 rounded-sm hover:bg-brick-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Decline
              </button>
            </div>
          )}

          {/* Actions — admin: active → Terminate */}
          {isAdmin && request.status === 'active' && (
            <div className="bg-white border border-navy/10 rounded-sm shadow-card p-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => openReason('terminate')}
                disabled={busy}
                className="border border-brick text-brick text-sm font-medium px-5 py-2.5 rounded-sm hover:bg-brick-light transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Terminate
              </button>
            </div>
          )}

          {/* Actions — admin: termination_pending → Approve Termination */}
          {isAdmin && request.status === 'termination_pending' && (
            <div className="bg-white border border-navy/10 rounded-sm shadow-card p-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleApproveTermination}
                disabled={busy}
                className="btn-primary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? 'Working...' : 'Approve Termination'}
              </button>
            </div>
          )}

          {/* Actions — owner: active → Request Termination (only lifecycle action) */}
          {isOwner && !isAdmin && request.status === 'active' && (
            <div className="bg-white border border-navy/10 rounded-sm shadow-card p-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => openReason('request_termination')}
                disabled={busy}
                className="btn-secondary text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Request Termination
              </button>
            </div>
          )}
        </div>

        {/* Right column: timeline + note composer */}
        <div className="space-y-6">
          {canAddNote && (
            <div className="bg-white border border-navy/10 rounded-sm shadow-card p-5">
              <label htmlFor="management-note" className="label-field">
                Add a note
              </label>
              <textarea
                id="management-note"
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Log a call, visit, or coordination note..."
                className="input-field resize-none text-sm mb-3"
              />
              <button
                type="button"
                onClick={handleAddNote}
                disabled={noteBusy || !note.trim()}
                className="btn-gold text-sm w-full disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {noteBusy ? 'Adding...' : 'Add Note'}
              </button>
            </div>
          )}

          <div className="bg-white border border-navy/10 rounded-sm shadow-card p-5">
            <h2 className="font-semibold text-navy mb-4">Activity Timeline</h2>
            <ManagementActivityTimeline activities={activities} />
            {activityPagination.page < activityPagination.totalPages && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="mt-4 text-sm font-medium text-brass hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loadingMore ? 'Loading...' : 'Load more'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Reason mini-modal (decline / terminate / request termination) */}
      {reasonModal && (
        <ReasonModal
          meta={REASON_META[reasonModal]}
          optional={reasonModal === 'request_termination'}
          value={reason}
          error={reasonError}
          submitting={busy}
          onChange={handleReasonChange}
          onSubmit={submitReason}
          onClose={closeReason}
        />
      )}
    </div>
  );
};

export default ManagementRequestDetail;
