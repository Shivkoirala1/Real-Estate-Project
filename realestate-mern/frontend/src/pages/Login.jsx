import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const Login = () => {
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(form.email, form.password, rememberMe);
      showToast('Signed in successfully');
      const redirectTo = location.state?.from || (user.role === 'admin' ? '/dashboard/admin' : '/');
      navigate(redirectTo);
    } catch (err) {
      const data = err.response?.data;
      if (data?.requiresVerification) {
        showToast(data.message || 'Please verify your email first', 'error');
        navigate('/verify-email', { state: { email: data.email || form.email } });
        return;
      }
      setError(data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-5 py-20">
      <p className="eyebrow mb-2 text-center">Welcome back</p>
      <h1 className="text-3xl mb-8 text-center">Sign in to your account</h1>

      {error && <div className="bg-brick-light text-brick text-sm px-4 py-3 rounded-sm mb-5">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4 bg-white p-8 rounded-sm shadow-card border border-navy/10">
        <div>
          <label className="label-field">Email address</label>
          <input
            required
            type="email"
            autoComplete="username"
            className="input-field"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div>
          <label className="label-field">Password</label>
          <input
            required
            type="password"
            autoComplete="current-password"
            className="input-field"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 text-sm text-slate-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded border-navy/20 text-brass focus:ring-brass"
            />
            Remember me on this device
          </label>
          <Link to="/forgot-password" className="text-sm text-brass font-medium hover:underline">
            Forgot password?
          </Link>
        </div>
        <button disabled={loading} type="submit" className="btn-primary w-full">
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm text-slate-muted mt-6">
        Don't have an account? <Link to="/register" className="text-brass font-medium hover:underline">Register</Link>
      </p>
    </div>
  );
};

export default Login;
