import React from 'react';
import { Link } from 'react-router-dom';
import ManagementStatusBadge from './ManagementStatusBadge';

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// Compact request card for the admin queue (and the owner list in Slice B).
const ManagementRequestCard = ({ request, showOwner = false, to }) => {
  const property = request.property || {};
  const owner = request.owner || {};
  const services = request.services || [];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="font-medium text-navy truncate">{property.title || 'Untitled property'}</p>
        <ManagementStatusBadge status={request.status} />
      </div>
      {showOwner && (
        <p className="text-xs text-slate-muted mb-1">
          Owner: <span className="text-slate-ink">{owner.name || '—'}</span>
        </p>
      )}
      <p className="text-xs text-slate-muted mb-2">
        {services.length === 0 ? 'No services listed' : services.join(' · ')}
      </p>
      <p className="text-xs text-slate-muted">Requested {formatDate(request.createdAt)}</p>
    </>
  );
  const cls =
    'block bg-white border border-navy/10 rounded-sm p-4 shadow-card hover:shadow-lifted hover:border-brass/40 transition-all';
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
};

export default ManagementRequestCard;
