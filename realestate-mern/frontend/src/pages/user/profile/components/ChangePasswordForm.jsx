import React, { useState } from 'react';
import { useToast } from '../../../../context/ToastContext';
import { changePassword } from '../../../../services/authService';
import { validatePasswordChange } from '../utils/profileValidation';

const emptyForm = { currentPassword: '', newPassword: '', confirmNewPassword: '' };

// Password change only — fully independent from the profile-details save.
// Validation errors render inline on their fields; toasts confirm success
// or report non-field failures.
const ChangePasswordForm = () => {
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleClear = () => {
    setForm(emptyForm);
    setErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = validatePasswordChange(form);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setLoading(true);
    try {
      await changePassword(form.currentPassword, form.newPassword, form.confirmNewPassword);
      setForm(emptyForm);
      setErrors({});
      showToast('Password changed successfully');
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to change password';
      // A wrong current password belongs on that field, not just in a toast.
      if (err.response?.status === 401) {
        setErrors({ currentPassword: message });
      }
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const errorClass = (hasError) => (hasError ? 'border-brick focus:border-brick focus:ring-brick' : '');

  return (
    <form onSubmit={handleSubmit}>
      <section className="bg-white border border-navy/10 rounded-sm shadow-card p-6 md:p-8" aria-labelledby="security-heading">
        <p className="eyebrow mb-1">Security</p>
        <h3 id="security-heading" className="text-xl mb-2">Change password</h3>
        <p className="text-sm text-slate-muted mb-6 leading-relaxed">
          Enter your current password, then your new password twice, to confirm the change.
        </p>
        <div className="space-y-4">
          <div>
            <label htmlFor="pw-current" className="label-field">Current password</label>
            <input
              id="pw-current"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className={`input-field ${errorClass(errors.currentPassword)}`}
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              aria-invalid={!!errors.currentPassword}
            />
            {errors.currentPassword && <p className="text-xs text-brick mt-1" role="alert">{errors.currentPassword}</p>}
          </div>
          <div>
            <label htmlFor="pw-new" className="label-field">New password</label>
            <div className="relative">
              <input
                id="pw-new"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 6 characters"
                className={`input-field pr-16 ${errorClass(errors.newPassword)}`}
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                aria-invalid={!!errors.newPassword}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-brass hover:underline"
                aria-pressed={showPassword}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.newPassword && <p className="text-xs text-brick mt-1" role="alert">{errors.newPassword}</p>}
          </div>
          <div>
            <label htmlFor="pw-confirm" className="label-field">Confirm new password</label>
            <input
              id="pw-confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              className={`input-field ${errorClass(errors.confirmNewPassword)}`}
              value={form.confirmNewPassword}
              onChange={(e) => setForm({ ...form, confirmNewPassword: e.target.value })}
              aria-invalid={!!errors.confirmNewPassword}
            />
            {errors.confirmNewPassword && <p className="text-xs text-brick mt-1" role="alert">{errors.confirmNewPassword}</p>}
          </div>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 mt-6 pt-6 border-t border-navy/10">
          <button type="button" disabled={loading} onClick={handleClear} className="btn-secondary text-sm px-5 py-2.5 disabled:opacity-50">
            Clear
          </button>
          <button disabled={loading} type="submit" className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50">
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </section>
    </form>
  );
};

export default ChangePasswordForm;
