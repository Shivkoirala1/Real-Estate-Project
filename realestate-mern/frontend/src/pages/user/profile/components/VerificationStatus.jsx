import React from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { verificationFor } from '../utils/profileDisplay';

// What the user's verification state means and what they can do about it.
// Rendered only for non-admins; admins have no verification flow.
const VerificationStatus = () => {
  const { user } = useAuth();
  if (user?.role === 'admin') return null;

  const verification = verificationFor(user?.verificationStatus);
  const isRejected = user?.verificationStatus === 'rejected';

  return (
    <div className="bg-white border border-navy/10 rounded-sm shadow-card overflow-hidden">
      <div className={`h-1.5 ${verification.dotClass}`} aria-hidden="true" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-navy text-sm">Verification Status</p>
          <span className={`status-badge ${verification.badgeClass}`}>{verification.label}</span>
        </div>
        <p className="text-sm text-slate-muted leading-relaxed">{verification.message}</p>
        {isRejected && (
          <a href="#identity-verification" className="inline-block text-sm text-brass hover:underline font-medium mt-3">
            Re-upload documents →
          </a>
        )}
        {user?.verificationNote && (
          <p className="text-sm text-brick mt-3 pt-3 border-t border-navy/10">
            <span className="font-semibold">Note from admin:</span> {user.verificationNote}
          </p>
        )}
      </div>
    </div>
  );
};

export default VerificationStatus;
