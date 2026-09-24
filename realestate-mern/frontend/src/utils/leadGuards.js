/**
 * Client-side mirror of backend/utils/leadTransitions.js frozen-state rules.
 * UX protection only - the backend independently enforces every rule.
 */
export const isLeadFrozenForManualMove = (lead) => {
  if (!lead) return false;
  if (lead.stage === 'pending_verification') return true;
  if (lead.stage === 'closed' && ['sale_verified', 'rental_verified'].includes(lead.closedBy)) return true;
  return false;
};

export const frozenLeadBanner = (lead) => {
  if (!lead || !isLeadFrozenForManualMove(lead)) return null;
  if (lead.stage === 'pending_verification') {
    return {
      title: lead.dealType === 'rental' ? 'Rental submitted — awaiting admin verification' : 'Sale submitted — awaiting admin verification',
      body: 'The property is reserved until an admin reviews it. This lead cannot be moved manually.',
    };
  }
  return {
    title: `Closed by verified ${lead.closedBy === 'rental_verified' ? 'rent' : 'sale'} — read-only`,
    body: 'The transaction is complete and recorded. This lead cannot be reopened or edited.',
  };
};
