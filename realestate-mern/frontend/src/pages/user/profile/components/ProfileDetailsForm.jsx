import React, { useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { useToast } from '../../../../context/ToastContext';
import { updateProfile } from '../../../../services/authService';
import { validateProfileDetails } from '../utils/profileValidation';

// Personal information form. Owns its draft state, validation, and save /
// discard — identity documents live in IdentityVerification (separate
// request), passwords in ChangePasswordForm.
const ProfileDetailsForm = () => {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState({
    name: user?.name || '',
    phone: user?.phone || '',
    dateOfBirth: user?.dateOfBirth ? user.dateOfBirth.slice(0, 10) : '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const handleDiscard = () => {
    setForm({
      name: user?.name || '',
      phone: user?.phone || '',
      dateOfBirth: user?.dateOfBirth ? user.dateOfBirth.slice(0, 10) : '',
    });
    setErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = validateProfileDetails(form);
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    try {
      const fd = new FormData();
      if (form.name) fd.append('name', form.name);
      if (form.phone !== undefined) fd.append('phone', form.phone);
      if (form.dateOfBirth !== undefined) fd.append('dateOfBirth', form.dateOfBirth);
      const data = await updateProfile(fd);
      updateUser(data.user);
      setErrors({});
      showToast('Profile updated successfully');
    } catch (err) {
      showToast(err.response?.data?.message || 'Update failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <section className="bg-white border border-navy/10 rounded-sm shadow-card p-6 md:p-8" aria-labelledby="profile-details-heading">
        <p className="eyebrow mb-1">Personal Information</p>
        <h3 id="profile-details-heading" className="text-xl mb-6">Your details</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="profile-name" className="label-field">
              Full name <span className="text-brick" aria-hidden="true">*</span>
            </label>
            <input
              id="profile-name"
              required
              autoComplete="name"
              className={`input-field ${errors.name ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'profile-name-error' : undefined}
            />
            {errors.name && <p id="profile-name-error" className="text-xs text-brick mt-1" role="alert">{errors.name}</p>}
          </div>
          <div>
            <label className="label-field">Email address</label>
            <input disabled className="input-field bg-parchment/60 cursor-not-allowed" value={user?.email || ''} aria-describedby="profile-email-note" />
            <p id="profile-email-note" className="text-xs text-slate-muted mt-1">Your email is used to sign in and can't be changed here.</p>
          </div>
          <div>
            <label htmlFor="profile-phone" className="label-field">Phone number</label>
            <input
              id="profile-phone"
              type="tel"
              autoComplete="tel"
              className="input-field"
              placeholder="e.g. 98XXXXXXXX"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="profile-dob" className="label-field">
              Date of birth <span className="text-slate-muted text-xs font-normal">(optional — for your birthday bonus 🎂)</span>
            </label>
            <input
              id="profile-dob"
              type="date"
              className="input-field"
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
            />
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 mt-6 bg-white border border-navy/10 rounded-sm shadow-card px-6 py-4">
        <button type="button" onClick={handleDiscard} disabled={saving} className="btn-secondary text-sm px-5 py-2.5 disabled:opacity-50">
          Discard changes
        </button>
        <button disabled={saving} type="submit" className="btn-primary text-sm px-6 py-2.5 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </form>
  );
};

export default ProfileDetailsForm;
