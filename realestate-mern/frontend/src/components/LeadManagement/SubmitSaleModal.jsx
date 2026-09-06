import React, { useEffect, useState } from 'react';
import { createSale } from '../../services/saleService';
import { useToast } from '../../context/ToastContext';

const PAYMENT_TYPES = [
  {
    value: 'full_payment',
    label: 'Full Payment',
    description: 'Buyer pays the entire agreed amount upfront.',
  },
  {
    value: 'emi',
    label: 'EMI (installments)',
    description:
      'Buyer pays in monthly installments - the buyer email must belong to a registered account.',
  },
  {
    value: 'bank_loan',
    label: 'Bank Loan',
    description: 'Buyer finances the purchase through a bank or lender.',
  },
];

const EMPTY_FORM = {
  buyerName: '',
  buyerPhone: '',
  buyerEmail: '',
  agreedPrice: '',
  paymentType: 'full_payment',
  downPaymentAmount: '',
  remarks: '',
};

/**
 * Modal for filing a Sale on a lead in the negotiation stage.
 *
 * props:
 *  - lead:      the lead being sold on (buyer details prefilled from it)
 *  - property:  the lead's linked property (agreed price prefilled)
 *  - open, onClose, onSuccess
 */
const SubmitSaleModal = ({ lead, property, open, onClose, onSuccess }) => {
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Prefill / reset every time the modal opens for a lead + property pair.
  useEffect(() => {
    if (open) {
      setForm({
        buyerName: lead?.name || '',
        buyerPhone: lead?.phone || '',
        buyerEmail: lead?.email || '',
        agreedPrice:
          property?.price !== undefined && property?.price !== null
            ? String(property.price)
            : '',
        paymentType: 'full_payment',
        downPaymentAmount: '',
        remarks: '',
      });
      setErrors({});
    }
  }, [open, lead, property]);

  if (!open) return null;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const validate = () => {
    const next = {};
    if (!form.buyerName.trim()) next.buyerName = 'Buyer name is required';
    const price = Number(form.agreedPrice);
    if (form.agreedPrice === '' || !Number.isFinite(price) || price <= 0) {
      next.agreedPrice = 'Agreed price must be a number greater than 0';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || !validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        buyer: {
          name: form.buyerName.trim(),
          phone: form.buyerPhone.trim(),
          email: form.buyerEmail.trim(),
        },
        agreedPrice: Number(form.agreedPrice),
        paymentType: form.paymentType,
      };
      if (form.paymentType !== 'full_payment' && form.downPaymentAmount !== '') {
        const downPayment = Number(form.downPaymentAmount);
        if (Number.isFinite(downPayment) && downPayment > 0) {
          payload.downPaymentAmount = downPayment;
        }
      }
      if (form.remarks.trim()) payload.remarks = form.remarks.trim();

      await createSale(lead._id, payload);
      showToast('Sale submitted for verification', 'success');
      onSuccess && onSuccess();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit sale', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPayment = PAYMENT_TYPES.find((t) => t.value === form.paymentType);

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
            <p className="eyebrow mb-1">Sale</p>
            <h2 className="text-xl">Submit Sale for Verification</h2>
            <p className="text-sm text-slate-muted mt-1">
              {property?.title ? (
                <>
                  Property: <span className="font-medium text-slate-ink">{property.title}</span>
                  {property.price ? ` · listed at NPR ${Number(property.price).toLocaleString()}` : ''}
                </>
              ) : (
                'File the agreed deal for admin verification.'
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-slate-muted hover:text-navy text-xl leading-none p-1"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Buyer name *</label>
              <input
                type="text"
                className="input-field text-sm"
                value={form.buyerName}
                onChange={(e) => setField('buyerName', e.target.value)}
                placeholder="Full buyer name"
              />
              {errors.buyerName && (
                <p className="mt-1 text-xs text-brick">{errors.buyerName}</p>
              )}
            </div>
            <div>
              <label className="label-field">Buyer phone</label>
              <input
                type="tel"
                className="input-field text-sm"
                value={form.buyerPhone}
                onChange={(e) => setField('buyerPhone', e.target.value)}
                placeholder="98XXXXXXXX"
              />
            </div>
          </div>

          <div>
            <label className="label-field">Buyer email</label>
            <input
              type="email"
              className="input-field text-sm"
              value={form.buyerEmail}
              onChange={(e) => setField('buyerEmail', e.target.value)}
              placeholder="buyer@example.com"
            />
            <p className="mt-1 text-xs text-slate-muted">
              If this email belongs to a registered account it will be linked automatically
              (required for EMI).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-field">Agreed price (NPR) *</label>
              <input
                type="number"
                min="0"
                step="any"
                className="input-field text-sm"
                value={form.agreedPrice}
                onChange={(e) => setField('agreedPrice', e.target.value)}
                placeholder="e.g. 12500000"
              />
              {errors.agreedPrice && (
                <p className="mt-1 text-xs text-brick">{errors.agreedPrice}</p>
              )}
            </div>
            <div>
              <label className="label-field">Payment type *</label>
              <select
                className="input-field text-sm"
                value={form.paymentType}
                onChange={(e) => setField('paymentType', e.target.value)}
              >
                {PAYMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedPayment && (
            <p className="text-xs text-slate-muted bg-parchment/60 border border-navy/10 rounded-sm px-3 py-2">
              {selectedPayment.description}
            </p>
          )}

          {form.paymentType !== 'full_payment' && (
            <div>
              <label className="label-field">Down payment amount (NPR, optional)</label>
              <input
                type="number"
                min="0"
                step="any"
                className="input-field text-sm"
                value={form.downPaymentAmount}
                onChange={(e) => setField('downPaymentAmount', e.target.value)}
                placeholder="e.g. 2500000"
              />
            </div>
          )}

          <div>
            <label className="label-field">Remarks</label>
            <textarea
              rows={3}
              className="input-field text-sm"
              value={form.remarks}
              onChange={(e) => setField('remarks', e.target.value)}
              placeholder="Deal context, payment notes, agreements..."
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-navy/10">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="btn-gold text-sm disabled:opacity-60">
              {submitting ? 'Submitting...' : 'Submit Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubmitSaleModal;
