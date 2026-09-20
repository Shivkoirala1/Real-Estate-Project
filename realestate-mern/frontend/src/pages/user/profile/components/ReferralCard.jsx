import React from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useToast } from '../../../../context/ToastContext';

// Secondary card: referral code copy. Rendered only for non-admins.
const ReferralCard = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  if (user?.role === 'admin' || !user?.referralCode) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(user.referralCode);
      showToast('Referral code copied');
    } catch (err) {
      showToast('Could not copy — long-press the code to copy it manually', 'error');
    }
  };

  return (
    <div className="bg-navy rounded-sm p-6">
      <p className="font-semibold text-ivory text-sm mb-2">Refer a friend</p>
      <p className="text-sm text-ivory/60 leading-relaxed mb-3">
        Share your code — you both earn Youth Coins when they join.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate bg-white/10 text-brass-light text-sm font-semibold px-3 py-2 rounded-sm tracking-wide">
          {user.referralCode}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="text-xs font-medium text-brass hover:underline flex-shrink-0"
        >
          Copy
        </button>
      </div>
    </div>
  );
};

export default ReferralCard;
