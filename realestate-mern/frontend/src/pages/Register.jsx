import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import CameraCapture from '../components/CameraCapture';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\d{10}$/;
const MAX_ID_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_ID_PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

const Register = () => {
  const { register } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [stepOneErrors, setStepOneErrors] = useState({});

  const [selfieFile, setSelfieFile] = useState(null);
  const [selfiePreview, setSelfiePreview] = useState(null);
  const [citizenshipFront, setCitizenshipFront] = useState(null);
  const [citizenshipFrontPreview, setCitizenshipFrontPreview] = useState(null);
  const [citizenshipBack, setCitizenshipBack] = useState(null);
  const [citizenshipBackPreview, setCitizenshipBackPreview] = useState(null);
  const [stepTwoErrors, setStepTwoErrors] = useState({});

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const validateStepOne = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Please enter your full name';
    if (!form.email.trim()) next.email = 'Please enter your email address';
    else if (!EMAIL_REGEX.test(form.email.trim())) next.email = 'Please enter a valid email address';
    if (form.phone && !PHONE_REGEX.test(form.phone.trim())) next.phone = 'Phone number must be exactly 10 digits';
    if (!form.password) next.password = 'Please enter a password';
    else if (form.password.length < 6) next.password = 'Password must be at least 6 characters';
    if (!form.confirmPassword) next.confirmPassword = 'Please confirm your password';
    else if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match';
    setStepOneErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleFormChange = (field, value) => {
    setForm({ ...form, [field]: value });
    if (stepOneErrors[field]) setStepOneErrors({ ...stepOneErrors, [field]: undefined });
  };

  const handleAccountSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!validateStepOne()) return;
    setStep(2);
  };

  const handleSelfieCapture = (file, previewUrl) => {
    setSelfieFile(file);
    setSelfiePreview(previewUrl);
  };

  const validateIdPhoto = (file) => {
    if (!ALLOWED_ID_PHOTO_TYPES.includes(file.type)) {
      return 'Only PNG, JPG, or WEBP images are allowed';
    }
    if (file.size > MAX_ID_PHOTO_BYTES) {
      return 'File is too large - maximum size is 2MB';
    }
    return '';
  };

  const handleCitizenshipFrontChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const err = validateIdPhoto(file);
    if (err) {
      setStepTwoErrors({ ...stepTwoErrors, citizenshipFront: err });
      e.target.value = '';
      return;
    }
    setStepTwoErrors({ ...stepTwoErrors, citizenshipFront: undefined });
    setCitizenshipFront(file);
    setCitizenshipFrontPreview(URL.createObjectURL(file));
  };

  const handleCitizenshipBackChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const err = validateIdPhoto(file);
    if (err) {
      setStepTwoErrors({ ...stepTwoErrors, citizenshipBack: err });
      e.target.value = '';
      return;
    }
    setStepTwoErrors({ ...stepTwoErrors, citizenshipBack: undefined });
    setCitizenshipBack(file);
    setCitizenshipBackPreview(URL.createObjectURL(file));
  };

  const validateStepTwo = () => {
    const next = {};
    if (!selfieFile) next.selfie = 'Please capture a live selfie using your camera';
    if (!citizenshipFront) next.citizenshipFront = 'Please upload the front of your citizenship/ID';
    if (!citizenshipBack) next.citizenshipBack = 'Please upload the back of your citizenship/ID';
    setStepTwoErrors((prev) => ({ ...prev, ...next }));
    return Object.keys(next).length === 0;
  };

  const handleFinalSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!validateStepTwo()) return;

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('name', form.name);
      fd.append('email', form.email);
      fd.append('password', form.password);
      if (form.phone) fd.append('phone', form.phone);
      fd.append('selfiePhoto', selfieFile);
      fd.append('citizenshipPhotoFront', citizenshipFront);
      fd.append('citizenshipPhotoBack', citizenshipBack);

      const data = await register(fd);
      showToast(data.message || 'Registration submitted — check your email for a verification code');
      navigate('/verify-email', { state: { email: form.email } });
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-5 py-16">
      <p className="eyebrow mb-2 text-center">Join us</p>
      <h1 className="text-3xl mb-2 text-center">Create your account</h1>
      <p className="text-center text-sm text-slate-muted mb-8">
        Step {step} of 2 — {step === 1 ? 'Account details' : 'Identity verification'}
      </p>

      {error && <div className="bg-brick-light text-brick text-sm px-4 py-3 rounded-sm mb-5">{error}</div>}

      {step === 1 && (
        <form onSubmit={handleAccountSubmit} noValidate className="space-y-4 bg-white p-8 rounded-sm shadow-card border border-navy/10">
          <div>
            <label className="label-field">Full name</label>
            <input
              type="text"
              className={`input-field ${stepOneErrors.name ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
              value={form.name}
              onChange={(e) => handleFormChange('name', e.target.value)}
            />
            {stepOneErrors.name && <p className="text-xs text-brick mt-1">{stepOneErrors.name}</p>}
          </div>
          <div>
            <label className="label-field">Email address</label>
            <input
              type="email"
              className={`input-field ${stepOneErrors.email ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
              value={form.email}
              onChange={(e) => handleFormChange('email', e.target.value)}
            />
            {stepOneErrors.email && <p className="text-xs text-brick mt-1">{stepOneErrors.email}</p>}
          </div>
          <div>
            <label className="label-field">Phone number <span className="text-slate-muted text-xs font-normal">(optional)</span></label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="98XXXXXXXX"
              className={`input-field ${stepOneErrors.phone ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
              value={form.phone}
              onChange={(e) => handleFormChange('phone', e.target.value.replace(/\D/g, ''))}
            />
            {stepOneErrors.phone && <p className="text-xs text-brick mt-1">{stepOneErrors.phone}</p>}
          </div>
          <div>
            <label className="label-field">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                className={`input-field pr-16 ${stepOneErrors.password ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
                value={form.password}
                onChange={(e) => handleFormChange('password', e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-brass hover:underline"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {stepOneErrors.password && <p className="text-xs text-brick mt-1">{stepOneErrors.password}</p>}
          </div>
          <div>
            <label className="label-field">Confirm password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              className={`input-field ${stepOneErrors.confirmPassword ? 'border-brick focus:border-brick focus:ring-brick' : ''}`}
              value={form.confirmPassword}
              onChange={(e) => handleFormChange('confirmPassword', e.target.value)}
            />
            {stepOneErrors.confirmPassword && <p className="text-xs text-brick mt-1">{stepOneErrors.confirmPassword}</p>}
          </div>
          <button type="submit" className="btn-primary w-full">Continue to verification →</button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleFinalSubmit} noValidate className="space-y-6 bg-white p-8 rounded-sm shadow-card border border-navy/10">
          <div className="bg-sage-light text-sage text-sm px-4 py-3 rounded-sm">
            To keep listings trustworthy, every account is verified by an administrator before it can post
            a property. This takes a photo of you (via your camera, right now) and photos of both sides of
            your citizenship / national ID.
          </div>

          <div>
            <label className="label-field">Live selfie (camera)</label>
            <CameraCapture
              onCapture={handleSelfieCapture}
              capturedImage={selfiePreview}
              onRetake={() => { setSelfieFile(null); setSelfiePreview(null); }}
            />
            {stepTwoErrors.selfie && <p className="text-xs text-brick mt-1">{stepTwoErrors.selfie}</p>}
          </div>

          <div>
            <label className="label-field">Citizenship / ID — front side</label>
            {citizenshipFrontPreview ? (
              <div>
                <img src={citizenshipFrontPreview} alt="Citizenship front" className="w-full max-w-xs rounded-sm border border-navy/15" />
                <button type="button" onClick={() => { setCitizenshipFront(null); setCitizenshipFrontPreview(null); }} className="btn-secondary text-sm mt-3 py-2 px-4">
                  Choose a different photo
                </button>
              </div>
            ) : (
              <>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="input-field" onChange={handleCitizenshipFrontChange} />
                <p className="text-xs text-slate-muted mt-1">PNG, JPG, or WEBP. Maximum 2MB.</p>
              </>
            )}
            {stepTwoErrors.citizenshipFront && <p className="text-xs text-brick mt-1">{stepTwoErrors.citizenshipFront}</p>}
          </div>

          <div>
            <label className="label-field">Citizenship / ID — back side</label>
            {citizenshipBackPreview ? (
              <div>
                <img src={citizenshipBackPreview} alt="Citizenship back" className="w-full max-w-xs rounded-sm border border-navy/15" />
                <button type="button" onClick={() => { setCitizenshipBack(null); setCitizenshipBackPreview(null); }} className="btn-secondary text-sm mt-3 py-2 px-4">
                  Choose a different photo
                </button>
              </div>
            ) : (
              <>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="input-field" onChange={handleCitizenshipBackChange} />
                <p className="text-xs text-slate-muted mt-1">PNG, JPG, or WEBP. Maximum 2MB.</p>
              </>
            )}
            {stepTwoErrors.citizenshipBack && <p className="text-xs text-brick mt-1">{stepTwoErrors.citizenshipBack}</p>}
          </div>

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1">Back</button>
            <button disabled={loading} type="submit" className="btn-primary flex-1">
              {loading ? 'Submitting...' : 'Submit for verification'}
            </button>
          </div>
        </form>
      )}

      <p className="text-center text-sm text-slate-muted mt-6">
        Already have an account? <Link to="/login" className="text-brass font-medium hover:underline">Sign in</Link>
      </p>
    </div>
  );
};

export default Register;
