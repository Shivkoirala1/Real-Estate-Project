/**
 * Two-phase commission payout helpers (source of truth for phase invariants).
 *
 * A CommissionRecord's total (commissionAmount) is split once at verification
 * time into phase1Amount + phase2Amount. Payouts advance strictly in order:
 * pending (neither paid) -> partial (phase 1 paid) -> paid (both paid).
 *
 * Legacy compatibility fields isPaid / paidAt / paidNote are DERIVED from the
 * phase fields (never the other way around) so old filters/analytics keep
 * working during the transition release.
 */

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const PAYOUT_STATUSES = ['pending', 'partial', 'paid'];

/**
 * Compute the verify-time split.
 * @param {number} total - frozen commissionAmount (>= 0)
 * @param {*} raw - optional firstPhaseAmount from the request body
 * @returns {{ phase1Amount: number, phase2Amount: number }}
 * @throws {Error} with statusCode 400 when out of range / non-numeric
 */
const buildPhaseSplit = (total, raw) => {
  const normalizedTotal = round2(total);
  if (!Number.isFinite(normalizedTotal) || normalizedTotal < 0) {
    const err = new Error('Invalid commission total for phase split.');
    err.statusCode = 500;
    throw err;
  }
  if (raw === undefined || raw === null || raw === '') {
    const phase1Amount = round2(normalizedTotal / 2);
    return { phase1Amount, phase2Amount: round2(normalizedTotal - phase1Amount) };
  }
  const first = Number(raw);
  if (!Number.isFinite(first) || first < 0 || first > normalizedTotal + 0.01) {
    const err = new Error(
      `firstPhaseAmount must be a number between 0 and the commission total (${normalizedTotal}).`
    );
    err.statusCode = 400;
    throw err;
  }
  const phase1Amount = round2(first);
  // Preserve the exact total after rounding (remainder absorbs the residue).
  const phase2Amount = round2(normalizedTotal - phase1Amount);
  if (phase2Amount < -0.01) {
    const err = new Error(
      `firstPhaseAmount must be a number between 0 and the commission total (${normalizedTotal}).`
    );
    err.statusCode = 400;
    throw err;
  }
  return { phase1Amount, phase2Amount: Math.max(0, phase2Amount) };
};

/**
 * Derive payoutStatus from the two paid flags.
 */
const derivePayoutStatus = (phase1Paid, phase2Paid) => {
  if (phase1Paid && phase2Paid) return 'paid';
  if (phase1Paid && !phase2Paid) return 'partial';
  return 'pending';
};

/**
 * Synchronize the legacy compatibility fields from the phase fields.
 * Mutates and returns the passed record/plain object.
 * Zero-total commissions are treated as fully paid (no payable balance).
 */
const syncDerivedFields = (record) => {
  const total = round2(record.commissionAmount);
  // Zero commission: nothing to pay -> fully paid without payout clicks.
  if (total === 0) {
    record.phase1Amount = round2(record.phase1Amount ?? 0);
    record.phase2Amount = round2(record.phase2Amount ?? 0);
    record.phase1Paid = true;
    record.phase2Paid = true;
    const now = new Date();
    record.phase1PaidAt = record.phase1PaidAt || now;
    record.phase2PaidAt = record.phase2PaidAt || now;
    record.payoutStatus = 'paid';
    record.isPaid = true;
    record.paidAt = record.phase2PaidAt;
    if (!record.paidNote) {
      record.paidNote = record.phase2Note || record.phase1Note || 'Zero commission - auto-settled';
    }
    return record;
  }
  record.payoutStatus = derivePayoutStatus(!!record.phase1Paid, !!record.phase2Paid);
  record.isPaid = record.payoutStatus === 'paid';
  record.paidAt = record.isPaid ? record.phase2PaidAt || null : null;
  if (record.isPaid && !record.paidNote) {
    record.paidNote = record.phase2Note || record.phase1Note || '';
  }
  return record;
};

/**
 * Validate the amount invariant: phase1 + phase2 === total within ±0.01.
 * @returns {string|null} error message or null when valid
 */
const validateSplit = (total, phase1Amount, phase2Amount) => {
  const sum = round2(Number(phase1Amount) + Number(phase2Amount));
  if (Math.abs(sum - round2(total)) > 0.01) {
    return `Phase amounts (${sum}) must sum to the commission total (${round2(total)}).`;
  }
  if (Number(phase1Amount) < 0 || Number(phase2Amount) < 0) {
    return 'Phase amounts must be non-negative.';
  }
  return null;
};

module.exports = {
  round2,
  PAYOUT_STATUSES,
  buildPhaseSplit,
  derivePayoutStatus,
  syncDerivedFields,
  validateSplit,
};
