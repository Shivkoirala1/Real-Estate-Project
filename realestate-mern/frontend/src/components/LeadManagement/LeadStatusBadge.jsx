import React from 'react';
import { stageMeta } from '../../utils/leadConstants';

// Pipeline stage badge. Accepts legacy capitalized stage values gracefully.
// dealType ('sale' | 'rental') disambiguates the generic verification stage.
const LeadStatusBadge = ({ stage, dealType, size = 'sm' }) => {
  const meta = stageMeta(stage);
  const padding = size === 'xs' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]';
  const normalized = String(stage || '').trim().toLowerCase().replace(/\s+/g, '_');
  const dealSuffix =
    normalized === 'pending_verification' && (dealType === 'sale' || dealType === 'rental')
      ? ` · ${dealType === 'sale' ? 'Sale' : 'Rental'}`
      : '';

  return (
    <span
      className={`status-badge inline-flex items-center gap-1.5 ${padding}`}
      style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}{dealSuffix}
    </span>
  );
};

export default LeadStatusBadge;
