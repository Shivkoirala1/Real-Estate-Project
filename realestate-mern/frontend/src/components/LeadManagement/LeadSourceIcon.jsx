import React from 'react';
import { sourceMeta } from '../../utils/leadConstants';

// Small inline SVG icon identifying where a lead came from.
const ICONS = {
  contact_form: (
    // envelope
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M2.5 5.5A2.5 2.5 0 0 1 5 3h10a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 15 17H5a2.5 2.5 0 0 1-2.5-2.5v-9Zm2.1.3 4.9 3.9a.8.8 0 0 0 1 0l4.9-3.9a.9.9 0 0 0-.4-.1H5a.9.9 0 0 0-.4.1Zm11.7 1.7-4.6 3.7a2.4 2.4 0 0 1-3 0L4.1 7.5v7A.9.9 0 0 0 5 15.4h10a.9.9 0 0 0 .9-.9v-7Z" />
    </svg>
  ),
  property_visit: (
    // house with arrow
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M10 2.3 2.8 8.2a.8.8 0 0 0 1 1.24l.4-.32v6.13c0 .97.78 1.75 1.75 1.75h8.1c.97 0 1.75-.78 1.75-1.75V9.12l.4.32a.8.8 0 1 0 1-1.24L10 2.3Zm-1.6 8.2h3.2a.5.5 0 0 1 .5.5v4.7h-1.6v-3h-1v3H7.9v-4.7a.5.5 0 0 1 .5-.5Z" />
    </svg>
  ),
  office_visit: (
    // briefcase
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M7 4.75C7 3.78 7.78 3 8.75 3h2.5c.97 0 1.75.78 1.75 1.75V6h1.75C15.99 6 17 7 17 8.25v6C17 15.5 16 16.5 14.75 16.5h-9.5C4 16.5 3 15.5 3 14.25v-6C3 7 4 6 5.25 6H7V4.75Zm1.6 0V6h2.8V4.75a.15.15 0 0 0-.15-.15h-2.5a.15.15 0 0 0-.15.15ZM4.6 8.25v2.05c1.63.8 3.48 1.25 5.4 1.25s3.77-.45 5.4-1.25V8.25a.65.65 0 0 0-.65-.65h-9.5a.65.65 0 0 0-.65.65Z" />
    </svg>
  ),
  manual_create: (
    // user-plus
    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M8.5 3.5a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5ZM2.8 15.9a5.7 5.7 0 0 1 11.4 0 .85.85 0 0 1-.85.85H3.65a.85.85 0 0 1-.85-.85ZM15.1 6.2h1.15V5.05a.75.75 0 0 1 1.5 0V6.2h1.15a.75.75 0 0 1 0 1.5h-1.15v1.15a.75.75 0 0 1-1.5 0V7.7H15.1a.75.75 0 0 1 0-1.5Z" />
    </svg>
  ),
};

const COLORS = {
  contact_form: '#4C6FA0',
  property_visit: '#6B8F71',
  office_visit: '#B8863B',
  manual_create: '#1F2A44',
};

const LeadSourceIcon = ({ source, showLabel = false, className = '' }) => {
  const meta = sourceMeta(source);
  const icon = ICONS[source] || ICONS.manual_create;
  const color = COLORS[source] || COLORS.manual_create;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={`Source: ${meta.label}`}
    >
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-sm"
        style={{ backgroundColor: `${color}1A`, color }}
      >
        <span className="w-3.5 h-3.5">{icon}</span>
      </span>
      {showLabel && <span className="text-xs text-slate-muted">{meta.label}</span>}
    </span>
  );
};

export default LeadSourceIcon;
