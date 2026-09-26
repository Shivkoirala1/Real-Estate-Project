import React from 'react';
import { useSiteSettings } from '../../hooks/useSiteSettings';

// Public listing Terms & Policies. Text is admin-editable through Site
// Settings; every new property listing requires the creator's agreement.
const Terms = () => {
  const { settings, loading } = useSiteSettings();
  const policies = settings.policies || '';

  return (
    <div className="max-w-3xl mx-auto px-5 md:px-8 py-12">
      <p className="eyebrow mb-2">Platform policies</p>
      <h1 className="text-3xl mb-8">Listing Terms &amp; Policies</h1>
      {loading ? (
        <p className="text-slate-muted">Loading...</p>
      ) : policies ? (
        <p className="text-slate-ink leading-relaxed whitespace-pre-line">{policies}</p>
      ) : (
        <p className="text-slate-muted">
          Our listing terms are being prepared and will be published here soon.
        </p>
      )}
    </div>
  );
};

export default Terms;
