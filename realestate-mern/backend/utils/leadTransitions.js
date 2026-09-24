/**
 * Lead pipeline state machine — backend source of truth.
 *
 * Active stages move forward only (with the intentional `new → negotiation`
 * skip-forward allowed). `lost` is reachable from any active/non-frozen
 * stage but requires a reason. `pending_verification` and verification-
 * closed leads are frozen — they exit only through the sale/rental
 * verify/reject flows, never through manual stage moves.
 *
 * Manual `closed`/`lost` (closedBy === 'manual') keep the legacy reopen
 * behavior; that exception lives in the controller, not in this map.
 */
const LEAD_STAGES = [
  'new',
  'contacted',
  'site_visit_scheduled',
  'negotiation',
  'pending_verification',
  'closed',
  'lost',
];

const ACTIVE_STAGES = ['new', 'contacted', 'site_visit_scheduled', 'negotiation'];

// Explicit manual-move targets per source stage. `pending_verification`,
// `closed` and `lost` have no matrix entries: pending_verification exits
// only via verify/reject flows, and closed/lost are handled by the
// frozen-state + manual-reopen rules (see isFrozenForManualMove).
const ALLOWED_TRANSITIONS = {
  new: ['contacted', 'site_visit_scheduled', 'negotiation', 'lost'],
  contacted: ['site_visit_scheduled', 'negotiation', 'lost'],
  site_visit_scheduled: ['negotiation', 'lost'],
  negotiation: ['lost'],
};

const FROZEN_CLOSED_BY = ['sale_verified', 'rental_verified'];

// True when no ordinary manual mutation (stage move, edit, priority,
// follow-up, assignment) may touch the lead. Verification/reject flows and
// the narrow admin note-append exception bypass this (enforced per-route,
// not here).
const isFrozenForManualMove = (lead) => {
  if (!lead) return false;
  if (lead.stage === 'pending_verification') return true;
  if (lead.stage === 'closed' && FROZEN_CLOSED_BY.includes(lead.closedBy)) return true;
  return false;
};

const frozenReason = (lead) => {
  if (!lead || !isFrozenForManualMove(lead)) return null;
  if (lead.stage === 'pending_verification') {
    return 'This lead is awaiting sale/rental verification and cannot be moved manually.';
  }
  return 'This lead was closed by a verified sale/rent and is read-only.';
};

module.exports = {
  LEAD_STAGES,
  ACTIVE_STAGES,
  ALLOWED_TRANSITIONS,
  FROZEN_CLOSED_BY,
  isFrozenForManualMove,
  frozenReason,
};
