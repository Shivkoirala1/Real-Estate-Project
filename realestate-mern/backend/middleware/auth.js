const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - verifies JWT and attaches user to req
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed or expired' });
  }
};

// Optional auth - attaches req.user when a valid token is present, but never
// blocks the request when there isn't one. Needed for routes that are public
// (so anonymous visitors can still use them) but that should still recognize
// a logged-in sender when there is one - e.g. submitting a property inquiry
// while signed in, so the inquiry gets linked to your account and shows up
// under "Sent by Me" / lets you receive replies.
const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user && user.isActive) {
      req.user = user;
    }
  } catch (error) {
    // Invalid/expired token on a public route - just proceed as anonymous
    // rather than blocking the request.
  }
  next();
};

// Restrict route access to specific roles, e.g. authorize('admin')

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user ? req.user.role : 'guest'}' is not authorized to access this resource`,
      });
    }
    next();
  };
};

// Only admins, or users whose identity has been verified, may post/manage property listings
const requireVerified = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authorized, please log in' });
  }
  if (req.user.role === 'admin') return next();

  if (req.user.verificationStatus !== 'verified') {
    return res.status(403).json({
      success: false,
      message:
        req.user.verificationStatus === 'pending'
          ? 'Your account is awaiting admin verification before you can post properties'
          : 'Your verification was not approved. Please contact support.',
      verificationStatus: req.user.verificationStatus,
    });
  }
  next();
};

module.exports = { protect, optionalAuth, authorize, requireVerified };
