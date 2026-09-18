const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Socket.IO handshake authentication. Mirrors the REST `protect`
 * middleware (middleware/auth.js): same secret, same `{ id, role }`
 * claims, same user-exists + isActive checks.
 *
 * Token transport: `socket.handshake.auth.token`. The frontend stores the
 * JWT in localStorage/sessionStorage (see utils/axios.js) and cannot set
 * Authorization headers on a WebSocket handshake, so the socket.io `auth`
 * payload is the least invasive channel. Query-string tokens are
 * deliberately NOT accepted (URLs get logged by proxies).
 *
 * On success attaches a minimal verified identity to
 * `socket.data.user = { _id, role }` — `_id`/`role` come from the database
 * user, never from client-supplied values. Later phases (rooms, events)
 * must read identity only from here.
 *
 * Failures reject the connection via `next(err)` (client sees
 * `connect_error`). Nothing about REST auth changes here: no refresh
 * tokens, no new secrets, no logging of tokens.
 */
const socketAuth = async (socket, next) => {
  // Token is supplied by the upcoming frontend socket manager from the
  // same storage key the axios interceptor reads (localStorage token,
  // falling back to sessionStorage). Accept a `Bearer <token>`-prefixed
  // value too, so callers can reuse their Authorization-header builder.
  const raw = socket.handshake.auth && socket.handshake.auth.token;
  const token =
    typeof raw === 'string' && raw.startsWith('Bearer ') ? raw.slice(7) : raw;

  if (!token || typeof token !== 'string') {
    const err = new Error('Not authorized, no token provided');
    err.data = { code: 'UNAUTHORIZED' };
    return next(err);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      const err = new Error('Not authorized, user no longer exists');
      err.data = { code: 'UNAUTHORIZED' };
      return next(err);
    }

    if (!user.isActive) {
      const err = new Error('Your account has been deactivated');
      err.data = { code: 'ACCOUNT_DISABLED' };
      return next(err);
    }

    socket.data.user = { _id: String(user._id), role: user.role };
    return next();
  } catch (error) {
    // Covers invalid signature, malformed token, and expiry (TokenExpiredError).
    // Never log the token itself.
    const err = new Error('Not authorized, token failed or expired');
    err.data = { code: 'UNAUTHORIZED' };
    return next(err);
  }
};

module.exports = { socketAuth };
