/**
 * Shared monetary/numeric sanitization helpers.
 * Single coercion policy: coerce with Number(), then require finite.
 */

const MAX_AMOUNT = 1e11;
const MAX_TENURE_MONTHS = 360;
const MIN_DOWN_PAYMENT_RATIO = 0.1;
// Product policy for new percentage-based EMI filings: 10% <= pct <= 60%.
// 100% is explicitly invalid (an EMI sale must finance something).
const MIN_DOWN_PAYMENT_PERCENT = 10;
const MAX_DOWN_PAYMENT_PERCENT = 60;

/** Coerce to a finite number, or null when not a valid number. */
const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const isPositiveAmount = (value, max = MAX_AMOUNT) => {
  const n = toFiniteNumber(value);
  return n !== null && n > 0 && n <= max;
};

const isNonNegativeAmount = (value, max = MAX_AMOUNT) => {
  const n = toFiniteNumber(value);
  return n !== null && n >= 0 && n <= max;
};

/** Round to 2dp (paisa) to avoid float drift in equality checks. */
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * Down payment guard: required, >= 10% of agreedPrice, < agreedPrice.
 * Returns { ok, down } where down is the finite number.
 */
const validateDownPayment = (downPaymentAmount, agreedPrice) => {
  const agreed = toFiniteNumber(agreedPrice);
  const down = toFiniteNumber(downPaymentAmount);
  if (agreed === null || agreed <= 0) {
    return { ok: false, down, message: 'Agreed price must be a positive number' };
  }
  if (down === null) {
    return { ok: false, down, message: 'Down payment is required for EMI sales (minimum 10% of agreed price)' };
  }
  if (down < round2(agreed * MIN_DOWN_PAYMENT_RATIO)) {
    return {
      ok: false,
      down,
      message: `Down payment must be at least 10% of agreed price (minimum NPR ${round2(agreed * MIN_DOWN_PAYMENT_RATIO).toLocaleString()})`,
    };
  }
  if (down >= agreed) {
    return { ok: false, down, message: 'Down payment must be less than the agreed price' };
  }
  return { ok: true, down };
};

/**
 * Down-payment percent guard for new percentage-based EMI filings:
 * required, finite, 10 <= pct <= 60. Returns { ok, percent }.
 */
const validateDownPaymentPercent = (pct) => {
  const percent = toFiniteNumber(pct);
  if (percent === null) {
    return { ok: false, percent, message: 'Down payment percent is required for EMI sales (10-60%)' };
  }
  if (percent < MIN_DOWN_PAYMENT_PERCENT || percent > MAX_DOWN_PAYMENT_PERCENT) {
    return {
      ok: false,
      percent,
      message: `Down payment percent must be between ${MIN_DOWN_PAYMENT_PERCENT}% and ${MAX_DOWN_PAYMENT_PERCENT}%`,
    };
  }
  return { ok: true, percent };
};

/**
 * Deterministic percent -> amount conversion (single source of truth).
 * Uses the shared round2 so every caller derives the identical figure.
 */
const downPaymentAmountFromPercent = (agreedPrice, pct) =>
  round2(toFiniteNumber(agreedPrice) * toFiniteNumber(pct) / 100);

/**
 * Service-charge guard for EMI plan initialization: absent means 0;
 * otherwise finite and >= 0. Returns { ok, charge }.
 */
const validateServiceCharge = (value) => {
  if (value === undefined || value === null || value === '') {
    return { ok: true, charge: 0 };
  }
  const charge = toFiniteNumber(value);
  if (charge === null || charge < 0) {
    return { ok: false, charge, message: 'Service charge must be a non-negative number' };
  }
  return { ok: true, charge: round2(charge) };
};

/**
 * Single source of truth for the EMI principal:
 *   principal = round2(agreedPrice - downPaymentAmount + serviceChargeAmount)
 * serviceChargeAmount defaults to 0 (legacy plans).
 */
const emiPrincipal = (agreedPrice, downPaymentAmount, serviceChargeAmount = 0) =>
  round2(toFiniteNumber(agreedPrice) - toFiniteNumber(downPaymentAmount) + toFiniteNumber(serviceChargeAmount));

/**
 * Strict principal equality against the computed EMI principal (2dp).
 * serviceChargeAmount defaults to 0, preserving the legacy agreed-down check.
 */
const validatePrincipal = (principalAmount, agreedPrice, downPayment, serviceChargeAmount = 0) => {
  const principal = toFiniteNumber(principalAmount);
  if (principal === null || principal <= 0) {
    return { ok: false, principal, message: 'Principal amount must be a positive number' };
  }
  const expected = emiPrincipal(agreedPrice, downPayment, serviceChargeAmount);
  if (round2(principal) !== expected) {
    return {
      ok: false,
      principal,
      message: `Principal must equal agreed price minus down payment plus service charge (expected NPR ${expected.toLocaleString()})`,
    };
  }
  return { ok: true, principal };
};

/**
 * Strict payment guard: 0 < paid <= min(due, outstanding).
 */
const validatePaymentAmount = (paidAmount, dueAmount, outstanding) => {
  const paid = toFiniteNumber(paidAmount);
  if (paid === null || paid <= 0) {
    return { ok: false, paid, message: 'Payment amount must be greater than 0' };
  }
  const due = toFiniteNumber(dueAmount);
  if (due !== null && paid > due) {
    return { ok: false, paid, message: `Payment cannot exceed the due amount (NPR ${due.toLocaleString()})` };
  }
  const out = toFiniteNumber(outstanding);
  if (out !== null && paid > out) {
    return { ok: false, paid, message: `Payment cannot exceed the outstanding balance (NPR ${out.toLocaleString()})` };
  }
  return { ok: true, paid };
};

module.exports = {
  MAX_AMOUNT,
  MAX_TENURE_MONTHS,
  MIN_DOWN_PAYMENT_RATIO,
  MIN_DOWN_PAYMENT_PERCENT,
  MAX_DOWN_PAYMENT_PERCENT,
  toFiniteNumber,
  isPositiveAmount,
  isNonNegativeAmount,
  round2,
  validateDownPayment,
  validateDownPaymentPercent,
  downPaymentAmountFromPercent,
  validateServiceCharge,
  emiPrincipal,
  validatePrincipal,
  validatePaymentAmount,
};
