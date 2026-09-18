import React from 'react';

const STATUS_META = {
  pending: { label: 'Pending', className: 'bg-brass/15 text-brass-dark' },
  active: { label: 'Active', className: 'bg-sage-light text-sage' },
  declined: { label: 'Declined', className: 'bg-brick-light text-brick' },
  termination_pending: { label: 'Termination pending', className: 'bg-brass/15 text-brass-dark' },
  terminated: { label: 'Terminated', className: 'bg-navy/10 text-slate-muted' },
};

const ManagementStatusBadge = ({ status }) => {
  const meta = STATUS_META[status] || { label: status || '—', className: 'bg-navy/10 text-slate-muted' };
  return <span className={`status-badge ${meta.className}`}>{meta.label}</span>;
};

export default ManagementStatusBadge;
