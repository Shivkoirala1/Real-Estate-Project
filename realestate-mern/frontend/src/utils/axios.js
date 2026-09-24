import axios from 'axios';
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout : 60000,
});

// Phase 0 (direct-upload migration): the legacy multipart entity endpoints
// proxy bytes through Render, so large galleries / hero videos need a longer
// per-request window than the 60 s JSON default. Scoped to multipart calls
// only — the global default above is unchanged.
export const MULTIPART_TIMEOUT_MS = 180000;
export const multipartConfig = (extra = {}) => ({
  headers: { 'Content-Type': 'multipart/form-data' },
  timeout: MULTIPART_TIMEOUT_MS,
  ...extra,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token') || sessionStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
    }
    return Promise.reject(error);
  }
);

export default api;
