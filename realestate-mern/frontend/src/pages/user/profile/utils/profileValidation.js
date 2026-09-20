// Centralized validation rules for the Profile feature. Pure functions only
// — no React, no API calls — so every form component shares one source of
// truth instead of duplicating rules.

export const MAX_ID_PHOTO_BYTES = 2 * 1024 * 1024; // 2MB
export const ALLOWED_ID_PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
export const ID_PHOTO_HINT = 'PNG, JPG, or WEBP. Maximum 2MB.';

export const validateIdPhoto = (file) => {
  if (!file) return '';
  if (!ALLOWED_ID_PHOTO_TYPES.includes(file.type)) return 'Only PNG, JPG, or WEBP images are allowed';
  if (file.size > MAX_ID_PHOTO_BYTES) return 'File is too large - maximum size is 2MB';
  return '';
};

export const validateProfileDetails = ({ name }) => {
  const errors = {};
  if (!name.trim()) errors.name = 'Full name is required';
  return errors;
};

export const validatePasswordChange = ({ currentPassword, newPassword, confirmNewPassword }) => {
  const errors = {};
  if (!currentPassword) errors.currentPassword = 'Enter your current password';
  if (!newPassword) {
    errors.newPassword = 'Enter a new password';
  } else if (newPassword.length < 6) {
    errors.newPassword = 'New password must be at least 6 characters';
  } else if (currentPassword && newPassword === currentPassword) {
    errors.newPassword = 'New password must be different from your current password';
  }
  if (!confirmNewPassword) {
    errors.confirmNewPassword = 'Re-enter the new password to confirm it';
  } else if (newPassword !== confirmNewPassword) {
    errors.confirmNewPassword = 'Passwords do not match';
  }
  return errors;
};

export const isValidOtpCode = (code) => /^\d{6}$/.test(code || '');
