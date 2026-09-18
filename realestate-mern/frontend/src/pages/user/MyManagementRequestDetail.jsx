import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getManagementRequestById,
  getActivities,
  requestTermination,
  addActivity,
} from '../../services/propertyManagementService';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import ManagementStatusBadge from '../../components/PropertyManagement/ManagementStatusBadge';
import ManagementActivityTimeline from '../../components/PropertyManagement/ManagementActivityTimeline';

const ACTIVITY_PAGE_SIZE = 20;

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Owner-facing detail: property info, services, note, status, timeline and
// decision/termination info. The owner's only lifecycle action is
// active -> Request Termination (confirmed, irreversible from their side).
const MyManagementRequestDetail = () => {
  const { id } = useParams();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const [request, setRequest] = useState(null);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [reqData, actData] = await Promise.all([
        getManagementRequestById(id),
        getActivities(id, { page: 1, limit: ACTIVITY_PAGE_SIZE }).catch(() => null),
      ]);
      setRequest(reqData.request || null);
      setActivities(actData?.activities || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load request');
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError('');
      await load();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [load]);

  const handleRequestTermination = async () => {
    const ok = await confirm({
      title: 'Request termination?',
      message:
        'Your reason is sent to the admin, who makes the final decision. Once submitted, you cannot reverse this request.',
      confirmLabel: 'Yes, send it',
      cancelLabel: 'Cancel',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await requestTermination(id, reason.trim());
      showToast('Termination request sent to the admin');
      setReason('');
      setShowForm(false);
      await load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send termination request', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleAddNote = async () => {
    if (!note.trim() || noteBusy) return;
    setNoteBusy(true);
    try {
      const data = await addActivity(id, note.trim());
      if (data.activity) setActivities((prev) => [data.activity, ...prev]);
      setNote('');
      showToast('Note added to timeline');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add note', 'error');
    } finally {
      setNoteBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-muted">Loading request...</p>;
  if (error || !request) {
    return (
      <div>
        <Link to="/my-properties/management" className="text-sm text-slate-muted hover:text-navy">
          ← Back
        </Link>
        <p className="text-sm text-brick mt-4">{error || 'Request not found.'}</p>
      </div>
    );
  }

  const property = request.property || {};
  const services = request.services || [];

  return (
    <div>
      <Link
        to="/my-properties/management"
        className="inline-flex items-center gap-1.5 text-sm text-slate-muted hover:text-navy mb-4 transition-colors"
      >
        ← Back
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <p className="eyebrow mb-2">Management Request</p>
          <h1 className="text-3xl mb-1">{property.title || 'Untitled property'}</h1>
          <p className="text-sm text-slate-muted">Requested {formatDate(request.createdAt)}</p>
        </div>
        <ManagementStatusBadge status={request.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-navy/10 rounded-sm shadow-card p-5">
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">Requested services</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {services.length === 0 ? (
                <p className="text-sm text-slate-muted">—</p>
              ) : (
                services.map((s) => (
                  <span key={s} className="text-xs font-medium bg-navy/10 text-navy px-2.5 py-1 rounded-sm">
                    {s}
                  </span>
                ))
              )}
            </div>
            {request.note && (
              <>
                <p className="text-xs uppercase tracking-wide text-slate-muted mb-1">Your note</p>
                <p className="text-sm text-slate-ink whitespace-pre-line mb-5">{request.note}</p>
              </>
            )}
            {request.status === 'declined' && request.decisionReason && (
              <div className="bg-brick-light border border-brick/20 rounded-sm px-4 py-3 text-sm text-brick">
                <span className="font-medium">Decline reason:</span> {request.decisionReason}
              </div>
            )}
            {['termination_pending', 'terminated'].includes(request.status) && request.terminationReason && (
              <div className="bg-parchment border border-navy/10 rounded-sm px-4 py-3 mt-4 text-sm text-slate-ink">
                <span className="font-medium">Your termination reason:</span> {request.terminationReason}
              </div>
            )}
            {request.status === 'terminated' && request.terminatedReason && (
              <div className="bg-brick-light border border-brick/20 rounded-sm px-4 py-3 mt-4 text-sm text-brick">
                <span className="font-medium">Termination reason:</span> {request.terminatedReason}
              </div>
            )}
          </div>

          {request.status === 'active' && (
            <div className="bg-white border border-navy/10 rounded-sm shadow-card p-5">
              {!showForm ? (
                <button type="button" onClick={() => setShowForm(true)} className="btn-secondary text-sm">
                  Request Termination
                </button>
              ) : (
                <>
                  <label htmlFor="owner-term-reason" className="label-field">
                    Reason (optional)
                  </label>
                  <textarea
                    id="owner-term-reason"
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Why do you want to end this management arrangement?"
                    className="input-field resize-none mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleRequestTermination}
                      disabled={busy}
                      className="btn-primary text-sm px-4 py-2 disabled:opacity-60"
                    >
                      {busy ? 'Sending...' : 'Send termination request'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForm(false);
                        setReason('');
                      }}
                      className="btn-secondary text-sm px-4 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-navy/10 rounded-sm shadow-card p-5">
            <label htmlFor="owner-note" className="label-field">
              Add a note
            </label>
            <textarea
              id="owner-note"
              rows={3}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Message for the admin..."
              className="input-field resize-none text-sm mb-3"
            />
            <button
              type="button"
              onClick={handleAddNote}
              disabled={noteBusy || !note.trim()}
              className="btn-gold text-sm w-full disabled:opacity-60"
            >
              {noteBusy ? 'Adding...' : 'Add Note'}
            </button>
          </div>

          <div className="bg-white border border-navy/10 rounded-sm shadow-card p-5">
            <h2 className="font-semibold text-navy mb-4">Activity Timeline</h2>
            <ManagementActivityTimeline activities={activities} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyManagementRequestDetail;
