import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getVisits, updateVisit } from '../../services/visitService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';

// Visit status -> badge styling, same convention as the buyer's My Visits page
const visitStatusStyles = {
  pending_agent_review: { label: 'Pending Review', bg: '#B08D57' }, // brass
  confirmed: { label: 'Confirmed', bg: '#6B8F71' }, // sage
  rejected: { label: 'Declined', bg: '#A64B42' }, // brick
  completed: { label: 'Completed', bg: '#1F2A44' }, // navy
  cancelled: { label: 'Cancelled', bg: '#8A8A82' }, // slate-muted
};

const visitTypeLabel = (type) => (type === 'office' ? 'Office Meeting' : 'Site Visit');

const formatSlot = (dateStr) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const PAGE_SIZE = 10;

// Agent actions: only completion, cancellation and coordination notes.
// Approval / rejection / assignment / rescheduling stay with the admins.
const COMPLETABLE = ['confirmed'];
const CANCELLABLE = ['pending_agent_review', 'confirmed'];

/**
 * Agent Visit Management.
 * Lists the visits assigned to the signed-in agent (the API scopes the
 * response automatically) and lets the agent:
 *  - mark a confirmed visit as completed (the linked lead moves to Negotiation)
 *  - cancel a pending/confirmed visit (the buyer is notified)
 *  - keep coordination notes on any assigned visit
 */
const VisitManagement = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: PAGE_SIZE });
  const [updatingId, setUpdatingId] = useState(null);

  const [notesVisit, setNotesVisit] = useState(null);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getVisits({
        page,
        limit: PAGE_SIZE,
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      setVisits(data.visits || []);
      setPagination(data.pagination || { total: 0, page: 1, pages: 1, limit: PAGE_SIZE });
    } catch (err) {
      setVisits([]);
      setLoadError(
        err.response?.data?.message ||
          "Something went wrong loading your assigned visits. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadVisits();
  }, [loadVisits]);

  const handleFilterChange = (value) => {
    setStatusFilter(value);
    setPage(1);
  };

  const handleStatusChange = async (visit, status, successMessage) => {
    setUpdatingId(visit._id);
    try {
      await updateVisit(visit._id, { status });
      showToast(successMessage);
      setNotesVisit(null);
      await loadVisits();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Failed to update the visit. Please try again.',
        'error'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleComplete = async (visit) => {
    const propertyLabel = visit.property?.title ? ` for "${visit.property.title}"` : '';
    const ok = await confirm({
      title: 'Mark this visit as completed?',
      message: `Confirm that the ${visitTypeLabel(visit.visitType).toLowerCase()}${propertyLabel} took place. The linked lead moves to Negotiation so you can follow up.`,
      confirmLabel: 'Yes, mark completed',
      cancelLabel: 'Not yet',
    });
    if (!ok) return;

    await handleStatusChange(
      visit,
      'completed',
      'Visit marked as completed - the linked lead is now in Negotiation'
    );
  };

  const handleCancel = async (visit) => {
    const propertyLabel = visit.property?.title ? ` for "${visit.property.title}"` : '';
    const ok = await confirm({
      title: 'Cancel this visit?',
      message: `The buyer of the ${visitTypeLabel(visit.visitType).toLowerCase()}${propertyLabel} will be notified that the visit was cancelled.`,
      confirmLabel: 'Yes, cancel it',
      cancelLabel: 'No, keep it',
    });
    if (!ok) return;

    await handleStatusChange(visit, 'cancelled', 'Visit cancelled - the buyer has been notified');
  };

  const handleSaveNotes = async (internalNotes) => {
    if (!notesVisit) return;

    setUpdatingId(notesVisit._id);
    try {
      await updateVisit(notesVisit._id, { internalNotes });
      showToast('Visit notes saved');
      setNotesVisit(null);
      await loadVisits();
    } catch (err) {
      showToast(
        err.response?.data?.message || 'Failed to save the notes. Please try again.',
        'error'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const isBusy = (visit) => updatingId === visit._id;

  const filterOptions = [
    { value: '', label: 'All' },
    { value: 'pending_agent_review', label: 'Pending Review' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'completed', label: 'Completed' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'rejected', label: 'Declined' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-14">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="eyebrow mb-1">Agent Dashboard</p>
          <h1 className="text-2xl">Visit Management</h1>
          <p className="text-sm text-slate-muted mt-1 max-w-xl">
            The visits assigned to you. Mark them completed or cancelled and
            keep coordination notes - approval stays with the admins.
          </p>
        </div>

        <div className="flex gap-1 bg-parchment rounded-sm p-1 flex-wrap">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleFilterChange(opt.value)}
              className={`text-xs md:text-sm font-medium px-3 py-1.5 rounded-sm transition-colors ${
                statusFilter === opt.value
                  ? 'bg-white text-navy shadow-sm'
                  : 'text-slate-muted hover:text-navy'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <p className="text-center py-20 text-slate-muted">Loading your visits...</p>
      ) : loadError ? (
        <div className="text-center py-20">
          <p className="font-display text-xl mb-2 text-brick">Couldn't load your visits</p>
          <p className="text-slate-muted text-sm mb-4">{loadError}</p>
          <button onClick={loadVisits} className="btn-secondary text-sm px-4 py-2">
            Try again
          </button>
        </div>
      ) : visits.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-navy/20 rounded-sm bg-parchment/40">
          <p className="font-display text-xl mb-2">
            No visits {statusFilter ? 'in this category' : 'assigned to you yet'}
          </p>
          <p className="text-slate-muted text-sm">
            Once an admin assigns a buyer visit to you, it shows up here.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {visits.map((visit) => {
              const style = visitStatusStyles[visit.status] || visitStatusStyles.pending_agent_review;
              const canComplete = COMPLETABLE.includes(visit.status);
              const canCancel = CANCELLABLE.includes(visit.status);
              const leadId = visit.convertedLead?._id || visit.convertedLead;

              return (
                <div
                  key={visit._id}
                  className="bg-white border border-navy/10 rounded-sm p-5 shadow-card flex flex-col"
                >
                  <div className="flex items-start justify-between mb-3 gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">
                        {visitTypeLabel(visit.visitType)}
                      </p>
                      <h3 className="font-display text-lg text-navy leading-tight">
                        {visit.property?.title ? (
                          <Link
                            to={`/properties/${visit.property.slug || visit.property._id}`}
                            className="hover:text-brass"
                          >
                            {visit.property.title}
                          </Link>
                        ) : (
                          'Office Meeting'
                        )}
                      </h3>
                    </div>
                    <span
                      className="status-badge text-white flex-shrink-0"
                      style={{ backgroundColor: style.bg }}
                    >
                      {style.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">
                        Requested Slot
                      </p>
                      <p className="text-sm font-medium text-navy">
                        {formatSlot(visit.requestedSlot)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">
                        Buyer
                      </p>
                      <div className="text-sm font-medium text-navy">
                        <p>{visit.requestedBy?.name || 'Unknown buyer'}</p>
                        {visit.requestedBy?.phone && (
                          <a
                            href={`tel:${visit.requestedBy.phone}`}
                            className="text-brass hover:underline block"
                          >
                            {visit.requestedBy.phone}
                          </a>
                        )}
                        {visit.requestedBy?.email && (
                          <p className="text-xs text-slate-muted break-all">
                            {visit.requestedBy.email}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {visit.buyerNotes && (
                    <div className="mb-4">
                      <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">
                        Buyer Notes
                      </p>
                      <p className="text-sm text-slate-ink whitespace-pre-line">
                        {visit.buyerNotes}
                      </p>
                    </div>
                  )}

                  {visit.convertedLead && (
                    <div className="mb-4 flex items-center gap-2 flex-wrap">
                      <span className="status-badge bg-sage-light text-sage">
                        Lead · {(visit.convertedLead.stage || 'new').replace(/_/g, ' ')}
                      </span>
                      <Link
                        to={`/dashboard/lead-management/leads/${leadId}`}
                        className="text-xs text-sage hover:underline"
                      >
                        View Lead →
                      </Link>
                    </div>
                  )}

                  {visit.internalNotes && (
                    <div className="mb-4">
                      <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">
                        Your Notes
                      </p>
                      <p className="text-sm text-slate-ink whitespace-pre-line line-clamp-2">
                        {visit.internalNotes}
                      </p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-auto pt-3 border-t border-navy/10 flex flex-wrap justify-end gap-2">
                    <button
                      onClick={() => setNotesVisit(visit)}
                      disabled={isBusy(visit)}
                      className="text-sm px-3 py-2 rounded-sm transition-colors text-navy border border-navy/10 hover:border-brass hover:text-brass disabled:opacity-50"
                    >
                      {visit.internalNotes ? 'Edit Notes' : 'Add Notes'}
                    </button>

                    <button
                      disabled={!canComplete || isBusy(visit)}
                      onClick={() => handleComplete(visit)}
                      className={`text-sm px-3 py-2 rounded-sm transition-colors ${
                        canComplete
                          ? 'text-white bg-sage hover:opacity-90'
                          : 'text-slate-muted border border-navy/10 cursor-not-allowed opacity-60'
                      }`}
                      title={canComplete ? '' : 'Only confirmed visits can be marked completed'}
                    >
                      {isBusy(visit) ? 'Saving...' : 'Mark Completed'}
                    </button>

                    <button
                      disabled={!canCancel || isBusy(visit)}
                      onClick={() => handleCancel(visit)}
                      className={`text-sm px-3 py-2 rounded-sm transition-colors ${
                        canCancel
                          ? 'text-white bg-brick hover:opacity-90'
                          : 'text-slate-muted border border-navy/10 cursor-not-allowed opacity-60'
                      }`}
                      title={
                        canCancel ? '' : `Cannot cancel a visit that is ${style.label.toLowerCase()}`
                      }
                    >
                      Mark Cancelled
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-8">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn-secondary text-sm px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Previous
              </button>
              <span className="text-sm text-slate-muted">
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                className="btn-secondary text-sm px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Notes Modal */}
      {notesVisit && (
        <NotesModal
          visit={notesVisit}
          onClose={() => setNotesVisit(null)}
          onSave={handleSaveNotes}
        />
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Notes Modal                                                                */
/* -------------------------------------------------------------------------- */

const NotesModal = ({ visit, onClose, onSave }) => {
  const [notes, setNotes] = useState(visit?.internalNotes || '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 px-4">
      <div className="bg-white w-full max-w-lg rounded-sm border border-navy/10 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-navy/10">
          <h2 className="text-lg text-navy font-medium">Visit Notes</h2>

          <button
            onClick={onClose}
            className="text-slate-muted hover:text-navy text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="bg-brass/10 border border-brass/20 rounded-sm p-3 mb-4">
            <p className="text-xs text-brass">
              Coordination notes about this visit - visible to you and admins,
              never shown to the buyer.
            </p>
          </div>

          <label className="block text-xs uppercase tracking-wide text-slate-muted mb-2">
            Notes
          </label>

          <textarea
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add coordination notes for admins and your own follow-up..."
            className="input-field w-full resize-none"
          />

          <div className="flex justify-end gap-2 mt-6">
            <button
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded-sm border border-navy/10 text-slate-muted hover:border-navy/20"
            >
              Cancel
            </button>

            <button onClick={() => onSave(notes)} className="btn-gold text-sm py-1.5 px-4">
              Save Notes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisitManagement;
