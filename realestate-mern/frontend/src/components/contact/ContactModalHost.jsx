import React, { useCallback, useEffect, useRef, useState } from 'react';
import { OPEN_CONTACT_MODAL_EVENT } from '../../utils/contactModal';
import ContactForm from './ContactForm';

// Global contact modal: opens on the shared event, traps no navigation.
// Escape / backdrop click dismiss; background scroll locks while open;
// focus moves to the dialog on open for keyboard and screen-reader users.
const ContactModalHost = () => {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener(OPEN_CONTACT_MODAL_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_CONTACT_MODAL_EVENT, handleOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="absolute inset-0 bg-navy-dark/60" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-heading"
        tabIndex={-1}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-sm shadow-lifted outline-none"
      >
        <div className="sticky top-0 bg-white border-b border-navy/10 px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="eyebrow mb-0.5">Get in touch</p>
            <h2 id="contact-modal-heading" className="text-xl text-navy">Contact us</h2>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close contact form"
            className="w-9 h-9 flex-shrink-0 rounded-full border border-navy/15 text-slate-ink hover:border-brass hover:text-brass transition-colors"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="px-6 py-6">
          <p className="text-sm text-slate-muted leading-relaxed mb-5">
            Have a question about a listing, or want to sell your property with us? Send a message and our team will respond shortly.
          </p>
          <ContactForm onSubmitted={close} />
        </div>
      </div>
    </div>
  );
};

export default ContactModalHost;
