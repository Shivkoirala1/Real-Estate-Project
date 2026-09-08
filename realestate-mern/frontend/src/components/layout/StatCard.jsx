import React from 'react';

const StatCard = ({ label, value, accent = '#B8863B' }) => (
  <div className="bg-white border border-navy/10 rounded-sm p-5 shadow-card">
    <p className="text-xs uppercase tracking-wide text-slate-muted mb-2">{label}</p>
    <p className="text-3xl font-display" style={{ color: accent }}>{value}</p>
  </div>
);

export default StatCard;
