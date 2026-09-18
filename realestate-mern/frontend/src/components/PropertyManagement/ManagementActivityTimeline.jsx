import React from 'react';
import { timeAgo } from '../../utils/format';

// Newest-first timeline of recordActivity entries. Shape mirrors the
// platform's other activity timelines ({ message, byName, createdAt }).
const ManagementActivityTimeline = ({ activities }) => {
  if (!activities || activities.length === 0) {
    return <p className="text-sm text-slate-muted">No activity yet.</p>;
  }
  return (
    <ul className="space-y-4">
      {(activities || []).map((a, i) => (
        <li key={a._id || i} className="flex gap-3">
          <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-brass" aria-hidden="true" />
          <div>
            <p className="text-sm text-slate-ink">{a.message}</p>
            <p className="text-xs text-slate-muted mt-0.5">
              {a.byName || 'System'}
              {a.createdAt ? ` · ${timeAgo(a.createdAt)}` : ''}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
};

export default ManagementActivityTimeline;
