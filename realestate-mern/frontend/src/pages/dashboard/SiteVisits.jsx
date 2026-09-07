import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { useConfirm } from '../../context/ConfirmContext';
import { imageUrl, timeAgo } from '../../utils/format';

const statusStyles = {
  pending: 'bg-brass/15 text-brass-dark',
  confirmed: 'bg-sage-light text-sage',
  completed: 'bg-navy/10 text-navy',
  cancelled: 'bg-brick-light text-brick',
};

const SiteVisits = () => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/site-visits/received');
      setVisits(data.visits);
    } catch (err) {
      showToast('Failed to load visit requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (visit, status) => {
    if (status === 'completed') {
      const confirmed = await confirm({
        title: 'Mark visit as completed?',
        message: `This confirms the site visit with ${visit.visitor?.name} actually took place, and awards them the completed-visit reward.`,
        confirmLabel: 'Yes, mark completed',
        cancelLabel: 'Not yet',
      });
      if (!confirmed) return;
    }
    try {
      await api.patch(`/site-visits/${visit._id}/status`, { status });
      showToast('Visit status updated');
      load();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update visit', 'error');
    }
  };

  return (
    <div>
      <p className="eyebrow mb-2">Requests</p>
      <h2 className="text-2xl mb-6">Site Visit Requests</h2>

      {loading ? (
        <p className="text-slate-muted">Loading...</p>
      ) : visits.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-navy/20 rounded-sm">
          <p className="font-display text-xl mb-2">No visit requests yet</p>
          <p className="text-sm text-slate-muted">When someone books a site visit on one of your properties, it'll show up here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visits.map((v) => (
            <div key={v._id} className="bg-white border border-navy/10 rounded-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <img
                src={imageUrl(v.property?.media?.coverImage)}
                alt={v.property?.title}
                className="w-16 h-16 rounded-sm object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <Link to={`/properties/${v.property?.slug || v.property?._id}`} className="font-medium text-navy hover:text-brass truncate block">
                  {v.property?.title}
                </Link>
                <p className="text-sm text-slate-muted">
                  {v.visitor?.name} ({v.visitor?.email}{v.visitor?.phone ? `, ${v.visitor.phone}` : ''})
                </p>
                <p className="text-xs text-slate-muted mt-1">
                  Preferred: {new Date(v.preferredDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {v.note && ` · "${v.note}"`} · requested {timeAgo(v.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`status-badge capitalize ${statusStyles[v.status]}`}>{v.status}</span>
                {v.status === 'pending' && (
                  <>
                    <button onClick={() => updateStatus(v, 'confirmed')} className="text-sm text-brass hover:underline">Confirm</button>
                    <button onClick={() => updateStatus(v, 'cancelled')} className="text-sm text-brick hover:underline">Cancel</button>
                  </>
                )}
                {v.status === 'confirmed' && (
                  <button onClick={() => updateStatus(v, 'completed')} className="text-sm text-sage hover:underline">Mark completed</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SiteVisits;
