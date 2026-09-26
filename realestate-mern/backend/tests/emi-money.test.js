// Phase 1: shared EMI money helpers - percent policy, deterministic
// rounding, service-charge guard, principal single source of truth.
// Run: node --test tests/emi-money.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  validateDownPaymentPercent,
  downPaymentAmountFromPercent,
  validateServiceCharge,
  emiPrincipal,
  validatePrincipal,
  validateDownPayment,
} = require('../utils/validateMoney');

describe('down-payment percent policy (10-60)', () => {
  it('10% and 60% are valid boundaries', () => {
    assert.equal(validateDownPaymentPercent(10).ok, true);
    assert.equal(validateDownPaymentPercent(60).ok, true);
    assert.equal(validateDownPaymentPercent('20').ok, true);
  });

  it('below 10% is invalid', () => {
    for (const bad of [0, 9.99, -5]) {
      assert.equal(validateDownPaymentPercent(bad).ok, false, `${bad}`);
    }
  });

  it('above 60% (incl. 100%) is invalid', () => {
    for (const bad of [60.01, 75, 100, 150]) {
      const r = validateDownPaymentPercent(bad).ok;
      assert.equal(r, false, `${bad}`);
    }
  });

  it('missing / non-numeric is invalid', () => {
    for (const bad of [undefined, null, '', 'abc']) {
      assert.equal(validateDownPaymentPercent(bad).ok, false, `${bad}`);
    }
  });

  it('percent -> amount is deterministic via shared round2', () => {
    assert.equal(downPaymentAmountFromPercent(5000000, 20), 1000000);
    assert.equal(downPaymentAmountFromPercent(5000000, 10), 500000);
    assert.equal(downPaymentAmountFromPercent(5000000, 60), 3000000);
    // Repeating decimal resolves identically on every call.
    const once = downPaymentAmountFromPercent(1000000, 33.333);
    assert.equal(once, downPaymentAmountFromPercent(1000000, 33.333));
    assert.equal(once, 333330);
  });
});

describe('service-charge guard', () => {
  it('absent means 0', () => {
    for (const v of [undefined, null, '']) {
      const r = validateServiceCharge(v);
      assert.equal(r.ok, true);
      assert.equal(r.charge, 0);
    }
  });

  it('zero and positive charges valid (rounded)', () => {
    assert.deepEqual(validateServiceCharge(0), { ok: true, charge: 0 });
    assert.deepEqual(validateServiceCharge(50000), { ok: true, charge: 50000 });
    assert.equal(validateServiceCharge(10.456).charge, 10.46);
  });

  it('negative / non-finite invalid', () => {
    for (const bad of [-1, -0.01, 'abc', NaN, Infinity]) {
      assert.equal(validateServiceCharge(bad).ok, false, `${bad}`);
    }
  });
});

describe('principal single source of truth', () => {
  it('legacy shape (no charge) matches agreed - down', () => {
    assert.equal(emiPrincipal(5000000, 1000000), 4000000);
    assert.equal(emiPrincipal(5000000, 1000000, 0), 4000000);
    assert.equal(emiPrincipal(5000000, 1000000, undefined), 4000000);
  });

  it('charge merges into principal', () => {
    assert.equal(emiPrincipal(5000000, 1000000, 50000), 4050000);
  });

  it('validatePrincipal honors the charge-extended invariant', () => {
    assert.equal(validatePrincipal(4000000, 5000000, 1000000).ok, true);
    assert.equal(validatePrincipal(4050000, 5000000, 1000000, 50000).ok, true);
    // Old principal against a charged plan fails.
    assert.equal(validatePrincipal(4000000, 5000000, 1000000, 50000).ok, false);
  });

  it('legacy amount validator untouched', () => {
    assert.equal(validateDownPayment(500000, 5000000).ok, true);
    assert.equal(validateDownPayment(499999, 5000000).ok, false);
  });
});
