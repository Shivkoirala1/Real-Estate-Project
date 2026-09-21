import React from 'react';
import { openContactModal } from '../../utils/contactModal';
import { useAuth } from '../../context/AuthContext';

// Fixed bottom-right contact CTA, visible on every page. Sits below toasts
// (z-40 vs toast z-100) so notifications never get buried, and respects the
// mobile safe-area inset. Hidden for admins - they answer inquiries instead
// of sending them.
const FloatingContactButton = () => {
  const { user } = useAuth();
  if (user?.role === 'admin') return null;

  return (
    <button
      type="button"
      onClick={openContactModal}
      aria-label="Contact us — open the contact form"
      className="fixed z-40 bottom-5 right-5 sm:bottom-6 sm:right-6 inline-flex items-center gap-2 rounded-full bg-brass px-4 py-3 sm:px-5 text-sm font-semibold text-ivory shadow-lifted transition-all hover:bg-brass-dark hover:shadow-lifted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      <span aria-hidden="true" className="text-base leading-none">✉</span>
      <span className="hidden sm:inline">Contact Us</span>
    </button>
  );
};

export default FloatingContactButton;
