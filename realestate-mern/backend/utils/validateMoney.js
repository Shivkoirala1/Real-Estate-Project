/**
 * Shared monetary/numeric sanitization helpers.
 * Single coercion policy: coerce with Number(), then require finite.
 */

const MAX_AMOUNT = 1e11;
const MAX_TENURE_MONTHS = 360;
const MIN_DOWN_PAYMENT_RATIO = 0.1;

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
 * Strict principal equality: principal === agreedPrice - downPayment (2dp).
 */
const validatePrincipal = (principalAmount, agreedPrice, downPayment) => {
  const principal = toFiniteNumber(principalAmount);
  if (principal === null || principal <= 0) {
    return { ok: false, principal, message: 'Principal amount must be a positive number' };
  }
  const expected = round2(toFiniteNumber(agreedPrice) - toFiniteNumber(downPayment));
  if (round2(principal) !== expected) {
    return {
      ok: false,
      principal,
      message: `Principal must equal agreed price minus down payment (expected NPR ${expected.toLocaleString()})`,
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
  toFiniteNumber,
  isPositiveAmount,
  isNonNegativeAmount,
  round2,
  validateDownPayment,
  validatePrincipal,
  validatePaymentAmount,
};
