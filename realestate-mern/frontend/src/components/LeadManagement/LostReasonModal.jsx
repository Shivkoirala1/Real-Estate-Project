import React, { useEffect, useState } from 'react';

// Shared "why was this lead lost?" dialog. The backend requires a valid
// reason (min 10 chars) for every move to `lost` - the select/drag callers
// open this instead of firing updateLeadStage directly.
const LostReasonModal = ({ open, leadName, saving, error, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Mark lead as lost"
    >
      <div className="absolute inset-0 bg-navy-dark/60" onClick={() => !saving && onClose()} />
      <div className="relative bg-white rounded-sm shadow-lifted max-w-md w-full p-6">
        <h2 className="font-display text-xl text-navy mb-2">Mark as lost</h2>
        <p className="text-sm text-slate-muted leading-relaxed mb-4">
          {leadName ? (
            <>Why did <span className="font-medium text-slate-ink">“{leadName}”</span> not convert? This reason is saved to the lead timeline.</>
          ) : (
            <>Why did this lead not convert? This reason is saved to the lead timeline.</>
          )}
        </p>
        <label className="label-field" htmlFor="lost-reason">Loss reason *</label>
        <textarea
          id="lost-reason"
          rows={3}
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Buyer found another property within budget…"
          className="input-field w-full"
        />
        {error && <p className="text-xs text-brick mt-1">{error}</p>}
        <div className="flex gap-3 justify-end mt-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-secondary text-sm px-4 py-2 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit(reason.trim())}
            disabled={saving}
            className="bg-brick text-white text-sm font-medium px-4 py-2 rounded-sm hover:bg-brick/90 transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Mark lost'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LostReasonModal;
