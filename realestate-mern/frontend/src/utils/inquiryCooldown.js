// Client-side mirror of the server's 1-hour inquiry cooldown.
// The backend (429 + retryAfterMinutes) is authoritative; this only gives
// instant feedback and disables the submit button without a round-trip.
// Key is scoped per form: 'general' or `property:<id>`.

export const INQUIRY_COOLDOWN_MS = 60 * 60 * 1000;

const keyFor = (scope) => `inquiry-cooldown:${scope}`;

export const getCooldownRemainingMs = (scope) => {
  try {
    const at = Number(localStorage.getItem(keyFor(scope)));
    if (!Number.isFinite(at) || at <= 0) return 0;
    return Math.max(0, at + INQUIRY_COOLDOWN_MS - Date.now());
  } catch {
    return 0;
  }
};

export const markCooldown = (scope) => {
  try {
    localStorage.setItem(keyFor(scope), String(Date.now()));
  } catch {
    // storage unavailable (private mode) - server still enforces
  }
};

/** "12 minute(s)" style label for the remaining wait. */
export const formatCooldownWait = (ms) => {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return `${minutes} minute(s)`;
};

export const cooldownMessageFor = (scope, ms) =>
  scope.startsWith('property:')
    ? `You've already sent an inquiry about this property recently. Please wait about ${formatCooldownWait(ms)} before sending another.`
    : `You've already sent a message recently. Please wait about ${formatCooldownWait(ms)} before sending another.`;
