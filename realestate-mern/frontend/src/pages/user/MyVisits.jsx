import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getMyVisits, cancelVisit } from '../../services/visitService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';

// Visit status → badge styling, following the same convention as statusStyles in utils/format
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

const CANCELLABLE = ['pending_agent_review', 'confirmed'];

const MyVisits = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 10 });
  const [cancellingId, setCancellingId] = useState(null);

  const loadVisits = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await getMyVisits({
        page,
        limit: 10,
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      setVisits(data.visits || []);
      setPagination(data.pagination || { total: 0, page: 1, pages: 1, limit: 10 });
    } catch (err) {
      setVisits([]);
      setLoadError(err.response?.data?.message || 'Something went wrong loading your visits. Please try again.');
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

  const handleCancel = async (visit) => {
    const propertyLabel = visit.property?.title ? ` for "${visit.property.title}"` : '';
    const confirmed = await confirm({
      title: 'Cancel this visit?',
      message: `Do you want to cancel your ${visitTypeLabel(visit.visitType).toLowerCase()} request${propertyLabel}? This can't be undone.`,
      confirmLabel: 'Yes, cancel it',
      cancelLabel: 'No, keep it',
    });
    if (!confirmed) return;

    setCancellingId(visit._id);
    try {
      await cancelVisit(visit._id);
      showToast('Visit request cancelled');
      setVisits((prev) => prev.map((v) => (v._id === visit._id ? { ...v, status: 'cancelled' } : v)));
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to cancel visit', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  const filterOptions = [
    { value: '', label: 'All' },
    { value: 'pending_agent_review', label: 'Pending Review' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'completed', label: 'Completed' },
    { value: 'rejected', label: 'Declined' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  return (
        <div className="max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-14">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <p className="eyebrow mb-1">Dashboard</p>
          <h1 className="text-2xl">My Visits</h1>
        </div>

        <div className="flex gap-1 bg-parchment rounded-sm p-1 flex-wrap">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleFilterChange(opt.value)}
              className={`text-xs md:text-sm font-medium px-3 py-1.5 rounded-sm transition-colors ${
                statusFilter === opt.value ? 'bg-white text-navy shadow-sm' : 'text-slate-muted hover:text-navy'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-center py-20 text-slate-muted">Loading your visits...</p>
      ) : loadError ? (
        <div className="text-center py-20">
          <p className="font-display text-xl mb-2 text-brick">Couldn't load your visits</p>
          <p className="text-slate-muted text-sm mb-4">{loadError}</p>
          <button onClick={loadVisits} className="btn-secondary text-sm px-4 py-2">Try again</button>
        </div>
      ) : visits.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-navy/20 rounded-sm bg-parchment/40">
          <p className="font-display text-xl mb-2">No visits {statusFilter ? 'in this category' : 'yet'}</p>
          <p className="text-slate-muted text-sm mb-4">
            Schedule a visit from any property page to see it show up here.
          </p>
          <Link to="/properties" className="text-brass hover:underline">Browse properties</Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {visits.map((visit) => {
              const style = visitStatusStyles[visit.status] || visitStatusStyles.pending_agent_review;
              const canCancel = CANCELLABLE.includes(visit.status);
              return (
                <div key={visit._id} className="bg-white border border-navy/10 rounded-sm p-5 shadow-card flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">
                        {visitTypeLabel(visit.visitType)}
                      </p>
                      <h3 className="font-display text-lg text-navy leading-tight">
                        {visit.property?.title ? (
                          <Link to={`/properties/${visit.property.slug || visit.property._id}`} className="hover:text-brass">
                            {visit.property.title}
                          </Link>
                        ) : (
                          'Office Meeting'
                        )}
                      </h3>
                    </div>
                    <span className="status-badge text-white flex-shrink-0" style={{ backgroundColor: style.bg }}>
                      {style.label}
                    </span>
                  </div>

                  {visit.property?.media?.coverImage && (
                    <img
                      src={visit.property.media.coverImage}
                      alt={visit.property.title}
                      className="w-full h-32 object-cover rounded-sm mb-4"
                    />
                  )}

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Requested Slot</p>
                      <p className="text-sm font-medium text-navy">{formatSlot(visit.requestedSlot)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Assigned Agent</p>
                      {visit.assignedAgent ? (
                        <div className="text-sm font-medium text-navy">
                          <p>{visit.assignedAgent.name}</p>
                          {visit.assignedAgent.phone && (
                            <a href={`tel:${visit.assignedAgent.phone}`} className="text-brass hover:underline block">
                              {visit.assignedAgent.phone}
                            </a>
                          )}
                          {visit.assignedAgent.email && (
                            <p className="text-xs text-slate-muted">{visit.assignedAgent.email}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-muted">Not yet assigned</p>
                      )}
                    </div>
                  </div>

                  {visit.buyerNotes && (
                    <div className="mb-4">
                      <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Your Notes</p>
                      <p className="text-sm text-slate-ink whitespace-pre-line">{visit.buyerNotes}</p>
                    </div>
                  )}

                  <div className="mt-auto pt-3 border-t border-navy/10 flex justify-end">
                    <button
                      disabled={!canCancel || cancellingId === visit._id}
                      onClick={() => handleCancel(visit)}
                      className={`text-sm px-3 py-2 rounded-sm transition-colors ${
                        canCancel
                          ? 'btn-secondary'
                          : 'text-slate-muted border border-navy/10 cursor-not-allowed opacity-60'
                      }`}
                      title={canCancel ? '' : `Cannot cancel a visit that is ${style.label.toLowerCase()}`}
                    >
                      {cancellingId === visit._id ? 'Cancelling...' : 'Cancel Request'}
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
    </div>
  );
};

export default MyVisits;