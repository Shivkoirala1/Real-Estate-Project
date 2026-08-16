import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const RESEND_COOLDOWN = 45; // seconds

const VerifyEmail = () => {
  const { verifyEmail, resendVerification } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const initialEmail = location.state?.email || new URLSearchParams(location.search).get('email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return setError('Please enter the email you registered with.');
    if (!code.trim()) return setError('Please enter the verification code sent to your email.');

    setError('');
    setLoading(true);
    try {
      await verifyEmail(email.trim(), code.trim());
      showToast('Email verified — welcome to Ashland Estates!');
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed. Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim()) return setError('Please enter your email first.');
    setError('');
    setResending(true);
    try {
      const data = await resendVerification(email.trim());
      showToast(data.message || 'A new code has been sent to your email');
      setCooldown(RESEND_COOLDOWN);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-5 py-20">
      <p className="eyebrow mb-2 text-center">One more step</p>
      <h1 className="text-3xl mb-2 text-center">Verify your email</h1>
      <p className="text-center text-sm text-slate-muted mb-8">
        We've sent a 6-digit code to your email address. Enter it below to activate your account.
      </p>

      {error && <div className="bg-brick-light text-brick text-sm px-4 py-3 rounded-sm mb-5">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-8 rounded-sm shadow-card border border-navy/10">
        <div>
          <label className="label-field">Email address</label>
          <input
            required
            type="email"
            className="input-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label-field">Verification code</label>
          <input
            required
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="6-digit code"
            className="input-field text-center text-2xl tracking-[0.5em] font-semibold"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <p className="text-xs text-slate-muted mt-1">The code expires 15 minutes after it's sent.</p>
        </div>
        <button disabled={loading} type="submit" className="btn-primary w-full">
          {loading ? 'Verifying...' : 'Verify email'}
        </button>
        <button
          type="button"
          disabled={resending || cooldown > 0}
          onClick={handleResend}
          className="w-full text-sm text-brass font-medium hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed py-1"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : resending ? 'Sending...' : "Didn't get a code? Resend it"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-muted mt-6">
        Already verified? <Link to="/login" className="text-brass font-medium hover:underline">Sign in</Link>
      </p>
    </div>
  );
};

export default VerifyEmail;
