// Shared display copy/helpers for the Profile feature (verification states,
// date formatting). Kept here so the header badge and the status card can
// never disagree about what a state means.

export const verificationCopy = {
  pending: {
    label: 'Pending Verification',
    badgeClass: 'bg-brass/15 text-brass-dark',
    dotClass: 'bg-brass',
    message: "Your registration documents are being reviewed by an administrator. You'll be able to post properties once approved — usually within 24 hours.",
  },
  verified: {
    label: 'Verified',
    badgeClass: 'bg-sage-light text-sage',
    dotClass: 'bg-sage',
    message: 'Your identity has been verified. You can post properties for sale at any time.',
  },
  rejected: {
    label: 'Verification Rejected',
    badgeClass: 'bg-brick-light text-brick',
    dotClass: 'bg-brick',
    message: 'Your verification was not approved. Re-upload clear documents below to request another review, or contact support for details.',
  },
};

export const verificationFor = (status) => verificationCopy[status] || verificationCopy.pending;

export const memberSince = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

export const initialOf = (name) => name?.charAt(0).toUpperCase() || '?';
