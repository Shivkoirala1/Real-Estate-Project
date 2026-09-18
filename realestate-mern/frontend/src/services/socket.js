import { io } from 'socket.io-client';

/**
 * Socket.IO client singleton (Phase 9).
 *
 * One connection per authenticated browser session. Auth uses the same JWT
 * storage the axios interceptor reads (localStorage, falling back to
 * sessionStorage), sent as the handshake `auth.token` the backend
 * socketAuth middleware verifies. The socket URL is derived from
 * VITE_API_URL by stripping the trailing `/api` (Socket.IO lives at the
 * server origin root, e.g. http://localhost:5000).
 *
 * Lifecycle contract:
 * - connectSocket() is idempotent; if the stored token changed since the
 *   socket was created (login as another user), the old socket is torn
 *   down and a fresh one connects with the new token.
 * - Auth rejections (bad/expired/deactivated) stop reconnection so a dead
 *   token does not retry forever; the next REST 401 runs the existing
 *   axios token-wipe, and AuthContext reconnects on the next login.
 * - Transient network failures keep the default reconnection behavior;
 *   every (re)connect fires `connect`, which subscribers use for REST
 *   resynchronization (unread counts, open-thread history, room rejoin).
 * - StrictMode-safe: connect/disconnect are idempotent module functions,
 *   safe to call from effects that mount, clean up, and remount.
 */

let socket = null;
const connectHandlers = new Set();

export const getStoredToken = () =>
  localStorage.getItem('token') || sessionStorage.getItem('token');

export const getSocketUrl = () =>
  (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

const isAuthFailure = (err) =>
  err && err.data && (err.data.code === 'UNAUTHORIZED' || err.data.code === 'ACCOUNT_DISABLED');

const attachBaseHandlers = (s) => {
  s.on('connect', () => {
    for (const cb of connectHandlers) {
      try {
        cb();
      } catch (_) {
        // One subscriber's resync must never break the others.
      }
    }
  });
  s.on('connect_error', (err) => {
    // Dead token: stop retrying. The existing axios 401 path owns the
    // logout/wipe UX; AuthContext reconnects on the next login.
    if (isAuthFailure(err)) {
      s.disconnect();
    }
  });
};

export const connectSocket = () => {
  const token = getStoredToken();
  if (!token) return null;
  if (socket) {
    if (socket.auth && socket.auth.token === token) return socket;
    socket.disconnect();
    socket.removeAllListeners();
    socket = null;
  }
  const s = io(getSocketUrl(), {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    timeout: 10000,
  });
  attachBaseHandlers(s);
  socket = s;
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket.removeAllListeners();
    socket = null;
  }
};

export const getSocket = () => socket;

/**
 * Subscribe to every (re)connect for REST resynchronization.
 * Returns an unsubscribe function. Callbacks must be idempotent.
 */
export const onSocketConnect = (cb) => {
  connectHandlers.add(cb);
  return () => {
    connectHandlers.delete(cb);
  };
};
