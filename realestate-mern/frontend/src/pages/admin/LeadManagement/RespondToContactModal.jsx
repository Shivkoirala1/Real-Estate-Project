import React, { useState } from 'react';
import { respondToContactForm } from '../../../services/contactFormService';
import { useToast } from '../../../context/ToastContext';

// Modal for replying to a contact form submission.
const RespondToContactModal = ({ contactForm, onClose, onResponded }) => {
  const { showToast } = useToast();
  const [response, setResponse] = useState(contactForm.response || '');
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!response.trim()) return;

    setSending(true);
    try {
      await respondToContactForm(contactForm._id, response.trim());
      showToast('Response sent');
      onResponded && onResponded();
      onClose();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to send response', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-sm shadow-card max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-navy/10">
          <p className="eyebrow mb-1">Contact Form</p>
          <h2 className="text-xl">Respond to {contactForm.name}</h2>
          <p className="text-xs text-slate-muted mt-1">
            {contactForm.email}
            {contactForm.phone ? ` · ${contactForm.phone}` : ''}
          </p>
        </div>

        <div className="px-6 py-4 bg-parchment/60 border-b border-navy/10 text-sm">
          <p className="font-semibold text-navy mb-1">{contactForm.subject}</p>
          <p className="text-slate-ink whitespace-pre-wrap">{contactForm.message}</p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="label-field">Your response</label>
            <textarea
              rows={5}
              className="input-field"
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder="Write your reply..."
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending || !response.trim()}
              className="btn-gold text-sm disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send response'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RespondToContactModal;
