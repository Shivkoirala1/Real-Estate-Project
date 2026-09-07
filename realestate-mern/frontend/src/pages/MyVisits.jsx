import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { imageUrl } from '../utils/format';

const statusStyles = {
  pending: 'bg-brass/15 text-brass-dark',
  confirmed: 'bg-sage-light text-sage',
  completed: 'bg-navy/10 text-navy',
  cancelled: 'bg-brick-light text-brick',
};

const MyVisits = () => {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get('/site-visits/my');
        setVisits(data.visits);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-5 md:px-8 py-16">
      <p className="eyebrow mb-2">Youth Rewards</p>
      <h1 className="text-4xl mb-8">My Site Visits</h1>

      {loading ? (
        <p className="text-slate-muted">Loading...</p>
      ) : visits.length === 0 ? (
        <div className="py-16 text-center border border-dashed border-navy/20 rounded-sm">
          <p className="font-display text-xl mb-2">No visits booked yet</p>
          <p className="text-sm text-slate-muted mb-4">Book a site visit from any property page to earn Youth Coins.</p>
          <Link to="/properties" className="text-brass hover:underline text-sm">Browse properties →</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {visits.map((v) => (
            <div key={v._id} className="bg-white border border-navy/10 rounded-sm p-5 flex items-center gap-4">
              <img
                src={imageUrl(v.property?.media?.coverImage)}
                alt={v.property?.title}
                className="w-16 h-16 rounded-sm object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <Link to={`/properties/${v.property?.slug || v.property?._id}`} className="font-medium text-navy hover:text-brass truncate block">
                  {v.property?.title}
                </Link>
                <p className="text-xs text-slate-muted mt-1">
                  Preferred: {new Date(v.preferredDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              </div>
              <span className={`status-badge capitalize flex-shrink-0 ${statusStyles[v.status]}`}>{v.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyVisits;
