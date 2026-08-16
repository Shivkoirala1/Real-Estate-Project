import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const ResetPassword = () => {
  const { resetPassword, forgotPassword } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const initialEmail = location.state?.email || new URLSearchParams(location.search).get('email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');

    setError('');
    setLoading(true);
    try {
      const data = await resetPassword(email.trim(), code.trim(), password);
      showToast(data.message || 'Password reset successfully');
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password. Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim()) return setError('Please enter your email first.');
    setError('');
    setResending(true);
    try {
      const data = await forgotPassword(email.trim());
      showToast(data.message || 'If an account exists, a new reset code has been sent.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend code.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-5 py-20">
      <p className="eyebrow mb-2 text-center">Account recovery</p>
      <h1 className="text-3xl mb-2 text-center">Reset your password</h1>
      <p className="text-center text-sm text-slate-muted mb-8">
        Enter the code we emailed you along with your new password.
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
          <label className="label-field">Reset code</label>
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
        </div>
        <div>
          <label className="label-field">New password</label>
          <input
            required
            minLength={6}
            type="password"
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="label-field">Confirm new password</label>
          <input
            required
            minLength={6}
            type="password"
            className="input-field"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <button disabled={loading} type="submit" className="btn-primary w-full">
          {loading ? 'Resetting...' : 'Reset password'}
        </button>
        <button
          type="button"
          disabled={resending}
          onClick={handleResend}
          className="w-full text-sm text-brass font-medium hover:underline disabled:opacity-50 py-1"
        >
          {resending ? 'Sending...' : "Didn't get a code? Resend it"}
        </button>
      </form>

      <p className="text-center text-sm text-slate-muted mt-6">
        Remembered it after all? <Link to="/login" className="text-brass font-medium hover:underline">Sign in</Link>
      </p>
    </div>
  );
};

export default ResetPassword;
