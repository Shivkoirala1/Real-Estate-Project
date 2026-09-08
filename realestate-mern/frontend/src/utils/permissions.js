// src/utils/permissions.js

export const isAdmin = (user) => {
  return user?.role === 'admin';
};

export const isAgent = (user) => {
  return user?.role === 'agent';
};

export const isVerified = (user) => {
  return isAdmin(user) || user?.verificationStatus === 'verified';
};

export const canPostProperty = (user) => {
  return isVerified(user);
};

export const getPropertyPostPath = (user) => {
  return isAdmin(user)
    ? '/dashboard/admin/properties/new'
    : '/my-properties/new';
};