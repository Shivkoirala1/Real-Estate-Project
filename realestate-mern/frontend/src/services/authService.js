import api from "../utils/axios";

/**
 * Register a new user
 * POST /api/auth/register
 *
 * Uses FormData because the registration endpoint
 * requires selfie and citizenship images.
 */
export const registerUser = async (formData) => {
  const response = await api.post("/auth/register", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

/**
 * Verify user's email using OTP/code
 * POST /api/auth/verify-email
 */
export const verifyEmail = async (email, code) => {
  const response = await api.post("/auth/verify-email", {
    email,
    code,
  });

  return response.data;
};

/**
 * Resend email verification code
 * POST /api/auth/resend-verification
 */
export const resendVerificationCode = async (email) => {
  const response = await api.post("/auth/resend-verification", {
    email,
  });

  return response.data;
};

/**
 * Login user
 * POST /api/auth/login
 */
export const loginUser = async (email, password) => {
  const response = await api.post("/auth/login", {
    email,
    password,
  });

  return response.data;
};

/**
 * Request password reset code
 * POST /api/auth/forgot-password
 */
export const forgotPassword = async (email) => {
  const response = await api.post("/auth/forgot-password", {
    email,
  });

  return response.data;
};

/**
 * Reset password using verification code
 * POST /api/auth/reset-password
 */
export const resetPassword = async (
  email,
  code,
  password
) => {
  const response = await api.post("/auth/reset-password", {
    email,
    code,
    password,
  });

  return response.data;
};

/**
 * Get currently logged-in user
 * GET /api/auth/me
 */
export const getCurrentUser = async () => {
  const response = await api.get("/auth/me");

  return response.data;
};

/**
 * Update user's profile
 * PUT /api/auth/profile
 *
 * Supports:
 * - name
 * - phone
 * - avatar
 * - selfiePhoto
 * - citizenshipPhotoFront
 * - citizenshipPhotoBack
 */
export const updateProfile = async (formData) => {
  const response = await api.put("/auth/profile", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

/**
 * Change user's password
 * PUT /api/auth/change-password
 */
export const changePassword = async (
  currentPassword,
  newPassword,
  confirmNewPassword
) => {
  const response = await api.put("/auth/change-password", {
    currentPassword,
    newPassword,
    confirmNewPassword,
  });

  return response.data;
};

/**
 * Logout user
 * POST /api/auth/logout
 */
export const logoutUser = async () => {
  const response = await api.post("/auth/logout");

  return response.data;
};