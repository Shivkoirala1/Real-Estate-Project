import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const ForgotPassword = () => {
  const { forgotPassword } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await forgotPassword(email.trim());
      showToast(data.message || 'If an account exists, a reset code has been sent.');
      navigate('/reset-password', { state: { email: email.trim() } });
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-5 py-20">
      <p className="eyebrow mb-2 text-center">Account recovery</p>
      <h1 className="text-3xl mb-2 text-center">Forgot your password?</h1>
      <p className="text-center text-sm text-slate-muted mb-8">
        Enter the email on your account and we'll send you a 6-digit reset code.
      </p>

      {error && <div className="bg-brick-light text-brick text-sm px-4 py-3 rounded-sm mb-5">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-8 rounded-sm shadow-card border border-navy/10">
        <div>
          <label className="label-field">Email address</label>
          <input
            required
            type="email"
            autoFocus
            className="input-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button disabled={loading} type="submit" className="btn-primary w-full">
          {loading ? 'Sending...' : 'Send reset code'}
        </button>
      </form>

      <p className="text-center text-sm text-slate-muted mt-6">
        Remembered it? <Link to="/login" className="text-brass font-medium hover:underline">Sign in</Link>
      </p>
    </div>
  );
};

export default ForgotPassword;
