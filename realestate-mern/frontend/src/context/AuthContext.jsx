import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  getCurrentUser,
  loginUser,
  registerUser,
  verifyEmail as verifyEmailRequest,
  resendVerificationCode,
  forgotPassword as forgotPasswordRequest,
  resetPassword as resetPasswordRequest,
} from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // logout must be declared BEFORE useEffect so it can be referenced in the catch block
  const logout = () => {
    // Clear both storages first to ensure a clean state
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    setUser(null);
  };

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await getCurrentUser();
        if (data && data.user) {
          setUser(data.user);
        } else {
          logout();
        }
      } catch (err) {
        // Token is invalid or expired — clear it
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('user');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email, password, rememberMe = false) => {
    const data = await loginUser(email, password);

    // Clear both storages first to ensure a clean state
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');

    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem('token', data.token);
    storage.setItem('user', JSON.stringify(data.user));

    setUser(data.user);
    return data.user;
  };

  const register = async (formData) => {
    // No token comes back here anymore - the account exists but is inactive
    // until the emailed 6-digit code is confirmed via verifyEmail().
    return registerUser(formData);
  };

  // Confirms the code emailed at registration (or via resend) and, on
  // success, logs the user in immediately since that's the natural moment
  // they've proven ownership of the account.
  const verifyEmail = async (email, code) => {
    const data = await verifyEmailRequest(email, code);
    sessionStorage.setItem('token', data.token);
    sessionStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const resendVerification = async (email) => {
    return resendVerificationCode(email);
  };

  const forgotPassword = async (email) => {
    return forgotPasswordRequest(email);
  };

  const resetPassword = async (email, code, password) => {
    return resetPasswordRequest(email, code, password);
  };

  const updateUser = (updated) => {
    setUser(updated);
    if (localStorage.getItem('token')) {
      localStorage.setItem('user', JSON.stringify(updated));
    } else {
      sessionStorage.setItem('user', JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, verifyEmail, resendVerification, forgotPassword, resetPassword, logout, updateUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      'useAuth must be used within AuthProvider'
    );
  }

  return context;
};