import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../api/axios';
import CameraCapture from '../components/CameraCapture';

const verificationCopy = {
  pending: {
    label: 'Pending Verification',
    badgeClass: 'bg-brass/15 text-brass-dark',
    dotClass: 'bg-brass',
    message: 'Your registration documents are being reviewed by an administrator. You\'ll be able to post properties once approved — usually within 24 hours.',
  },
  verified: {
    label: 'Verified',
    badgeClass: 'bg-sage-light text-sage',
    dotClass: 'bg-sage',
    message: 'Your identity has been verified. You can post properties for sale at any time.',
  },
  rejected: {
    label: 'Verification Rejected',
    badgeClass: 'bg-brick-light text-brick',
    dotClass: 'bg-brick',
    message: 'Your verification was not approved. Please contact support for details.',
  },
};

const memberSince = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const MAX_ID_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_ID_PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

const validateIdPhoto = (file) => {
  if (!ALLOWED_ID_PHOTO_TYPES.includes(file.type)) return 'Only PNG, JPG, or WEBP images are allowed';
  if (file.size > MAX_ID_PHOTO_BYTES) return 'File is too large - maximum size is 2MB';
  return '';
};

const Profile = () => {
  const { user, updateUser } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [loading, setLoading] = useState(false);
  const [selfieFile, setSelfieFile] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [citizenshipFront, setCitizenshipFront] = useState(null);
  const [citizenshipBack, setCitizenshipBack] = useState(null);
  const [errors, setErrors] = useState({});
  const [stats, setStats] = useState({ favorites: null, listings: null });

  // Password change is handled as its own independent form/request - it
  // requires the current password to be verified server-side before any
  // change is applied, so it's deliberately kept separate from the general
  // profile-details save.
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Quick-glance counts for the shortcut cards. Failures here shouldn't block
  // the rest of the profile page from rendering, so they're fetched
  // independently of the main form state.
  useEffect(() => {
    const loadStats = async () => {
      try {
        const [favRes, listRes] = await Promise.allSettled([
          api.get('/properties/my/favorites'),
          api.get('/properties/my/listings'),
        ]);
        setStats({
          favorites: favRes.status === 'fulfilled' ? (favRes.value.data.favorites || []).length : 0,
          listings: listRes.status === 'fulfilled' ? (listRes.value.data.count ?? (listRes.value.data.properties || []).length) : 0,
        });
      } catch (err) {
        setStats({ favorites: 0, listings: 0 });
      }
    };
    loadStats();
  }, []);

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Full name is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validatePasswordForm = () => {
    const next = {};
    if (!passwordForm.currentPassword) next.currentPassword = 'Enter your current password';
    if (!passwordForm.newPassword) {
      next.newPassword = 'Enter a new password';
    } else if (passwordForm.newPassword.length < 6) {
      next.newPassword = 'New password must be at least 6 characters';
    } else if (passwordForm.currentPassword && passwordForm.newPassword === passwordForm.currentPassword) {
      next.newPassword = 'New password must be different from your current password';
    }
    if (!passwordForm.confirmNewPassword) {
      next.confirmNewPassword = 'Re-enter the new password to confirm it';
    } else if (passwordForm.newPassword !== passwordForm.confirmNewPassword) {
      next.confirmNewPassword = 'Passwords do not match';
    }
    setPasswordErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleCitizenshipFrontChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const err = validateIdPhoto(file);
    if (err) {
      setErrors({ ...errors, citizenshipFront: err });
      e.target.value = '';
      return;
    }
    setErrors({ ...errors, citizenshipFront: undefined });
    setCitizenshipFront(file);
  };

  const handleCitizenshipBackChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const err = validateIdPhoto(file);
    if (err) {
      setErrors({ ...errors, citizenshipBack: err });
      e.target.value = '';
      return;
    }
    setErrors({ ...errors, citizenshipBack: undefined });
    setCitizenshipBack(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const fd = new FormData();
      if (form.name) fd.append('name', form.name);
      if (form.phone !== undefined) fd.append('phone', form.phone);
      if (selfieFile) fd.append('selfiePhoto', selfieFile);
      if (citizenshipFront) fd.append('citizenshipPhotoFront', citizenshipFront);
      if (citizenshipBack) fd.append('citizenshipPhotoBack', citizenshipBack);

      const { data } = await api.put('/auth/profile', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateUser(data.user);
      setSelfieFile(null);
      setSelfiePreview(null);
      setCitizenshipFront(null);
      setCitizenshipBack(null);
      setErrors({});
      showToast('Profile updated successfully');
    } catch (err) {
      showToast(err.response?.data?.message || 'Update failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!validatePasswordForm()) return;
    setPasswordLoading(true);
    try {
      await api.put('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        confirmNewPassword: passwordForm.confirmNewPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
      setPasswordErrors({});
      showToast('Password changed successfully');
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to change password';
      // Surface a "current password incorrect" response inline on that field, not just as a toast
      if (err.response?.status === 401) {
        setPasswordErrors({ currentPassword: message });
      }
      showToast(message, 'error');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleDiscard = () => {
    setForm({ name: user?.name || '', phone: user?.phone || '' });
    setSelfieFile(null);
    setSelfiePreview(null);
    setCitizenshipFront(null);
    setCitizenshipBack(null);
    setErrors({});
  };

  const verification = verificationCopy[user?.verificationStatus] || verificationCopy.pending;
  const isAdmin = user?.role === 'admin';
  const isVerified = user?.verificationStatus === 'verified';
  const since = memberSince(user?.createdAt);
  const initial = user?.name?.charAt(0).toUpperCase() || '?';

  return (
    <div className="max-w-5xl mx-auto px-5 md:px-8 py-10 md:py-14">
      <p className="eyebrow mb-2">Account</p>
      <h1 className="text-3xl mb-8">My Profile</h1>

      {/* Profile banner */}
      <div className="relative bg-navy rounded-sm overflow-hidden mb-6">
        <div className="absolute inset-0 opacity-[0.06]" style={{
          backgroundImage: 'repeating-linear-gradient(45deg, #F7F4EE 0, #F7F4EE 1px, transparent 1px, transparent 40px)'
        }} />
        <div className="relative px-6 md:px-10 py-8 md:py-10 flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-brass text-navy flex items-center justify-center font-display text-4xl overflow-hidden ring-4 ring-white/10 flex-shrink-0">
            {(selfiePreview || user?.selfiePhoto) ? (
              <img src={selfiePreview || user.selfiePhoto} alt={user?.name} className="w-full h-full object-cover" />
            ) : initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1.5">
              <h2 className="font-display text-2xl md:text-3xl text-ivory leading-tight truncate">{user?.name}</h2>
              <span className="status-badge bg-white/10 text-ivory capitalize">{user?.role}</span>
              {!isAdmin && (
                <span className={`status-badge inline-flex items-center gap-1.5 ${verification.badgeClass}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${verification.dotClass}`} />
                  {verification.label}
                </span>
              )}
            </div>
            <p className="text-ivory/70 text-sm">{user?.email}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ivory/50 text-xs mt-2">
              {user?.phone && <span>{user.phone}</span>}
              {since && <span>Member since {since}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Quick stats / shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link to="/favorites" className="group bg-white border border-navy/10 rounded-sm p-5 shadow-card hover:shadow-lifted hover:border-brass/40 transition-all">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-1.5">Saved Properties</p>
          <div className="flex items-center justify-between">
            <p className="font-display text-3xl text-navy">{stats.favorites ?? '—'}</p>
            <span className="text-brick text-xl">♥</span>
          </div>
          <p className="text-xs text-brass mt-2 group-hover:underline">View favorites →</p>
        </Link>
        <Link to="/my-properties" className="group bg-white border border-navy/10 rounded-sm p-5 shadow-card hover:shadow-lifted hover:border-brass/40 transition-all">
          <p className="text-xs uppercase tracking-wide text-slate-muted mb-1.5">Your Listings</p>
          <div className="flex items-center justify-between">
            <p className="font-display text-3xl text-navy">{stats.listings ?? '—'}</p>
            <span className="text-sage text-xl">⌂</span>
          </div>
          <p className="text-xs text-brass mt-2 group-hover:underline">Manage listings →</p>
        </Link>
        {isAdmin ? (
          <Link to="/dashboard/admin" className="group bg-navy rounded-sm p-5 shadow-card hover:shadow-lifted transition-all">
            <p className="text-xs uppercase tracking-wide text-ivory/50 mb-1.5">Admin</p>
            <p className="font-display text-lg text-ivory">Go to dashboard</p>
            <p className="text-xs text-brass mt-2 group-hover:underline">Open dashboard →</p>
          </Link>
        ) : isVerified ? (
          <Link to="/my-properties/new" className="group bg-brass rounded-sm p-5 shadow-card hover:shadow-lifted hover:bg-brass-dark transition-all">
            <p className="text-xs uppercase tracking-wide text-ivory/70 mb-1.5">Ready to sell?</p>
            <p className="font-display text-lg text-ivory">Post a property</p>
            <p className="text-xs text-ivory/80 mt-2 group-hover:underline">+ New listing →</p>
          </Link>
        ) : (
          <div className="bg-parchment/60 border border-dashed border-navy/15 rounded-sm p-5">
            <p className="text-xs uppercase tracking-wide text-slate-muted mb-1.5">Ready to sell?</p>
            <p className="text-sm text-slate-ink leading-relaxed">Complete verification below to unlock posting properties.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSubmit}>
            <div className="space-y-6">
              {/* Personal information */}
              <section className="bg-white border border-navy/10 rounded-sm shadow-card p-6 md:p-8">
                <p className="eyebrow mb-1">Personal Information</p>
                <h3 className="text-xl mb-6">Your details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="label-field">Full name</label>
                    <input
                      className={`input-field ${errors.name ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                    {errors.name && <p className="text-xs text-brick mt-1">{errors.name}</p>}
                  </div>
                  <div>
                    <label className="label-field">Email address</label>
                    <input disabled className="input-field bg-parchment/60 cursor-not-allowed" value={user?.email || ''} />
                    <p className="text-xs text-slate-muted mt-1">Your email is used to sign in and can't be changed here.</p>
                  </div>
                  <div>
                    <label className="label-field">Phone number</label>
                    <input
                      className="input-field"
                      placeholder="e.g. 98XXXXXXXX"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                </div>
              </section>

              {/* Identity verification */}
              {!isAdmin && !isVerified && (
                <section className="bg-white border border-navy/10 rounded-sm shadow-card p-6 md:p-8">
                  <p className="eyebrow mb-1">Identity Verification</p>
                  <h3 className="text-xl mb-2">Verification documents</h3>
                  <p className="text-sm text-slate-muted mb-6 leading-relaxed">
                    Required before you can post a property. Both documents are reviewed by our team and kept private.
                  </p>
                  <div className="space-y-5">
                    <div>
                      <label className="label-field">Live selfie (camera)</label>
                      <CameraCapture
                        onCapture={(file, previewUrl) => { setSelfieFile(file); setSelfiePreview(previewUrl); }}
                        capturedImage={selfiePreview}
                        onRetake={() => { setSelfieFile(null); setSelfiePreview(null); }}
                      />
                      {user?.selfiePhoto && !selfiePreview && (
                        <p className="text-xs text-sage mt-1.5 flex items-center gap-1"><span>✓</span> Current photo already on file</p>
                      )}
                    </div>
                    <div>
                      <label className="label-field">Citizenship / National ID — front side</label>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="input-field file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border-0 file:bg-navy file:text-ivory file:text-xs file:font-medium file:cursor-pointer cursor-pointer"
                        onChange={handleCitizenshipFrontChange}
                      />
                      <p className="text-xs text-slate-muted mt-1.5">PNG, JPG, or WEBP. Maximum 2MB.</p>
                      {errors.citizenshipFront && <p className="text-xs text-brick mt-1">{errors.citizenshipFront}</p>}
                      {citizenshipFront ? (
                        <p className="text-xs text-brass mt-1.5">{citizenshipFront.name} selected</p>
                      ) : user?.citizenshipPhotoFront ? (
                        <p className="text-xs text-sage mt-1.5 flex items-center gap-1"><span>✓</span> Current front photo already on file</p>
                      ) : (
                        <p className="text-xs text-slate-muted mt-1.5">No document uploaded yet</p>
                      )}
                    </div>
                    <div>
                      <label className="label-field">Citizenship / National ID — back side</label>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="input-field file:mr-3 file:py-1.5 file:px-3 file:rounded-sm file:border-0 file:bg-navy file:text-ivory file:text-xs file:font-medium file:cursor-pointer cursor-pointer"
                        onChange={handleCitizenshipBackChange}
                      />
                      <p className="text-xs text-slate-muted mt-1.5">PNG, JPG, or WEBP. Maximum 2MB.</p>
                      {errors.citizenshipBack && <p className="text-xs text-brick mt-1">{errors.citizenshipBack}</p>}
                      {citizenshipBack ? (
                        <p className="text-xs text-brass mt-1.5">{citizenshipBack.name} selected</p>
                      ) : user?.citizenshipPhotoBack ? (
                        <p className="text-xs text-sage mt-1.5 flex items-center gap-1"><span>✓</span> Current back photo already on file</p>
                      ) : (
                        <p className="text-xs text-slate-muted mt-1.5">No document uploaded yet</p>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </div>

            {/* Save bar (profile info only) */}
            <div className="flex items-center justify-end gap-3 mt-6 bg-white border border-navy/10 rounded-sm shadow-card px-6 py-4">
              <button type="button" onClick={handleDiscard} disabled={loading} className="btn-secondary text-sm px-5 py-2.5">
                Discard changes
              </button>
              <button disabled={loading} type="submit" className="btn-primary text-sm px-6 py-2.5">
                {loading ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>

          {/* Security - deliberately a separate form/request, since changing the
              password requires verifying the current one server-side first */}
          <form onSubmit={handlePasswordSubmit}>
            <section className="bg-white border border-navy/10 rounded-sm shadow-card p-6 md:p-8">
              <p className="eyebrow mb-1">Security</p>
              <h3 className="text-xl mb-2">Change password</h3>
              <p className="text-sm text-slate-muted mb-6 leading-relaxed">
                Enter your current password, then your new password twice, to confirm the change.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="label-field">Current password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className={`input-field ${passwordErrors.currentPassword ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  />
                  {passwordErrors.currentPassword && <p className="text-xs text-brick mt-1">{passwordErrors.currentPassword}</p>}
                </div>
                <div>
                  <label className="label-field">New password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="At least 6 characters"
                      className={`input-field pr-16 ${passwordErrors.newPassword ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-brass hover:underline"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {passwordErrors.newPassword && <p className="text-xs text-brick mt-1">{passwordErrors.newPassword}</p>}
                </div>
                <div>
                  <label className="label-field">Confirm new password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className={`input-field ${passwordErrors.confirmNewPassword ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                    value={passwordForm.confirmNewPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmNewPassword: e.target.value })}
                  />
                  {passwordErrors.confirmNewPassword && <p className="text-xs text-brick mt-1">{passwordErrors.confirmNewPassword}</p>}
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 mt-6 pt-6 border-t border-navy/10">
                <button
                  type="button"
                  disabled={passwordLoading}
                  onClick={() => { setPasswordForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' }); setPasswordErrors({}); }}
                  className="btn-secondary text-sm px-5 py-2.5"
                >
                  Clear
                </button>
                <button disabled={passwordLoading} type="submit" className="btn-primary text-sm px-6 py-2.5">
                  {passwordLoading ? 'Updating...' : 'Update password'}
                </button>
              </div>
            </section>
          </form>
        </div>

        {/* Sidebar: verification status detail */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 space-y-6">
            {!isAdmin && (
              <div className="bg-white border border-navy/10 rounded-sm shadow-card overflow-hidden">
                <div className={`h-1.5 ${verification.dotClass}`} />
                <div className="p-6">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold text-navy text-sm">Verification Status</p>
                    <span className={`status-badge ${verification.badgeClass}`}>{verification.label}</span>
                  </div>
                  <p className="text-sm text-slate-muted leading-relaxed">{verification.message}</p>
                  {user?.verificationNote && (
                    <p className="text-sm text-brick mt-3 pt-3 border-t border-navy/10">
                      <span className="font-semibold">Note from admin:</span> {user.verificationNote}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="bg-parchment/60 border border-navy/10 rounded-sm p-6">
              <p className="font-semibold text-navy text-sm mb-2">Need help?</p>
              <p className="text-sm text-slate-muted leading-relaxed mb-3">
                Questions about your account or a listing? Our team is happy to help.
              </p>
              <Link to="/contact" className="text-sm text-brass hover:underline font-medium">Contact support →</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
