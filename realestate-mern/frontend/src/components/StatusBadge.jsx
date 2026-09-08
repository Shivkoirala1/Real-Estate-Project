import React from 'react';
import { statusStyles, saleTypeStyles } from '../utils/format';

const MAPS = { status: statusStyles, saleType: saleTypeStyles };

// Shared badge so PropertyCard and PropertyDetail stay visually in sync.
// `variant="outline"` renders a bordered ghost badge instead of solid fill.
const StatusBadge = ({ type, value, className = '', variant = 'solid' }) => {
  const map = MAPS[type];
  const entry = map?.[value];
  if (!entry) return null;

  const style =
    variant === 'solid'
      ? { backgroundColor: entry.bg, color: '#fff' }
      : { color: entry.bg, borderColor: entry.bg };

  return (
    <span
      className={`status-badge ${variant === 'outline' ? 'border bg-transparent' : ''} ${className}`}
      style={style}
    >
      {entry.label}
    </span>
  );
};

export default StatusBadge;
