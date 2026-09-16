import React, { useEffect, useState } from 'react';
import { createRental } from '../../services/rentalService';
import { useToast } from '../../context/ToastContext';

const PAYMENT_FREQUENCIES = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const EMPTY_FORM = {
  tenantName: '',
  tenantPhone: '',
  tenantEmail: '',
  monthlyRent: '',
  durationInMonths: '12',
  startDate: '',
  securityDeposit: '',
  advanceMonths: '1',
  paymentFrequency: 'monthly',
  remarks: '',
};

/**
 * Modal for filing a Rental deal on a lead whose property is saleType 'rent'.
 *
 * props: lead, property, open, onClose, onSuccess
 */
const SubmitRentalModal = ({ lead, property, open, onClose, onSuccess }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        ...EMPTY_FORM,
        tenantName: lead?.name || '',
        tenantPhone: lead?.phone || '',
        tenantEmail: lead?.email || '',
        monthlyRent: property?.price != null ? String(property.price) : '',
        startDate: new Date().toISOString().slice(0, 10),
      });
      setErrors({});
    }
  }, [open, lead, property]);

  if (!open) return null;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const months = Number(form.durationInMonths);
  const rent = Number(form.monthlyRent);
  const leaseValue =
    Number.isFinite(rent) && Number.isFinite(months) ? rent * months : 0;

  const validate = () => {
    const next = {};
    if (!form.tenantName.trim()) next.tenantName = 'Tenant name is required';
    if (form.monthlyRent === '' || !Number.isFinite(rent) || rent <= 0)
      next.monthlyRent = 'Monthly rent must be a number greater than 0';
    if (!Number.isInteger(months) || months < 1)
      next.durationInMonths = 'Duration must be a whole number of months (min 1)';
    if (!form.startDate) next.startDate = 'Lease start date is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || !validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        tenant: {
          name: form.tenantName.trim(),
          phone: form.tenantPhone.trim(),
          email: form.tenantEmail.trim(),
        },
        monthlyRent: rent,
        durationInMonths: months,
        startDate: form.startDate,
        paymentFrequency: form.paymentFrequency,
      };
      if (form.securityDeposit !== '') payload.securityDeposit = Number(form.securityDeposit);
      if (form.advanceMonths !== '') payload.advanceMonths = Number(form.advanceMonths);
      if (form.remarks.trim()) payload.remarks = form.remarks.trim();

      await createRental(lead._id, payload);
      showToast('Rental submitted for verification', 'success');
      onSuccess && onSuccess();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit rental', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-dark/60"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="bg-white rounded-sm shadow-lifted max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <p className="eyebrow mb-1">Rental</p>
            <h2 className="text-xl">Submit Rental for Verification</h2>
            <p className="text-sm text-slate-muted mt-1">
              {property?.title ? (
                <>
                  Property: <span className="font-medium text-slate-ink">{property.title}</span>
                  {property.price ? ` · listed at NPR ${Number(property.price).toLocaleString()}/month` : ''}
                </>
              ) : (
                'File the agreed lease for admin verification.'
              )}
            </p>
          </div>
          <button onClick={onClose} disabled={submitting}
            className="text-slate-muted hover:text-navy text-xl leading-none p-1" aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Tenant name *</label>
              <input type="text" className="input-field text-sm" value={form.tenantName}
                onChange={(e) => setField('tenantName', e.target.value)} placeholder="Full tenant name" />
              {errors.tenantName && <p className="mt-1 text-xs text-brick">{errors.tenantName}</p>}
            </div>
            <div>
              <label className="label-field">Tenant phone</label>
              <input type="tel" className="input-field text-sm" value={form.tenantPhone}
                onChange={(e) => setField('tenantPhone', e.target.value)} placeholder="98XXXXXXXX" />
            </div>
          </div>

          <div>
            <label className="label-field">Tenant email</label>
            <input type="email" className="input-field text-sm" value={form.tenantEmail}
              onChange={(e) => setField('tenantEmail', e.target.value)} placeholder="tenant@example.com" />
            <p className="mt-1 text-xs text-slate-muted">
              Linked automatically to a registered account if it exists.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Monthly rent (NPR) *</label>
              <input type="number" min="0" step="any" className="input-field text-sm"
                value={form.monthlyRent} onChange={(e) => setField('monthlyRent', e.target.value)}
                placeholder="e.g. 25000" />
              {errors.monthlyRent && <p className="mt-1 text-xs text-brick">{errors.monthlyRent}</p>}
            </div>
            <div>
              <label className="label-field">Duration (months) *</label>
              <input type="number" min="1" className="input-field text-sm"
                value={form.durationInMonths} onChange={(e) => setField('durationInMonths', e.target.value)}
                placeholder="e.g. 12" />
              {errors.durationInMonths && <p className="mt-1 text-xs text-brick">{errors.durationInMonths}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label-field">Start date *</label>
              <input type="date" className="input-field text-sm" value={form.startDate}
                onChange={(e) => setField('startDate', e.target.value)} />
              {errors.startDate && <p className="mt-1 text-xs text-brick">{errors.startDate}</p>}
            </div>
            <div>
              <label className="label-field">Security deposit</label>
              <input type="number" min="0" step="any" className="input-field text-sm"
                value={form.securityDeposit} onChange={(e) => setField('securityDeposit', e.target.value)}
                placeholder="e.g. 50000" />
            </div>
            <div>
              <label className="label-field">Advance (months)</label>
              <input type="number" min="0" max="24" className="input-field text-sm"
                value={form.advanceMonths} onChange={(e) => setField('advanceMonths', e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label-field">Payment frequency</label>
            <select className="input-field text-sm" value={form.paymentFrequency}
              onChange={(e) => setField('paymentFrequency', e.target.value)}>
              {PAYMENT_FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          {leaseValue > 0 && (
            <p className="text-xs text-slate-ink bg-parchment/60 border border-navy/10 rounded-sm px-3 py-2">
              Total lease value: <span className="font-semibold">NPR {leaseValue.toLocaleString()}</span>{' '}
              (commission is calculated on this amount)
            </p>
          )}

          <div>
            <label className="label-field">Remarks</label>
            <textarea rows={3} className="input-field text-sm" value={form.remarks}
              onChange={(e) => setField('remarks', e.target.value)}
              placeholder="Lease terms, agreements, notes..." />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-navy/10">
            <button type="button" onClick={onClose} disabled={submitting} className="btn-secondary text-sm">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-gold text-sm disabled:opacity-60">
              {submitting ? 'Submitting...' : 'Submit Rental'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubmitRentalModal;