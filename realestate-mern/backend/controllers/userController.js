const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const crypto = require('crypto');

// Best-effort audit write - a failed audit log must never break the actual
// admin operation, so failures are swallowed after logging.
const recordAudit = async (entry) => {
  try {
    await AuditLog.create(entry);
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
};

// @desc    Get all users (with optional role filter)
// @route   GET /api/users
// @access  Private (admin)
const getUsers = asyncHandler(async (req, res) => {
  const { role, search, sort } = req.query;
  // Scope defaults to buyer accounts only - agents are managed via
  // /api/agents and admins are provisioned outside the app (plan §8.3).
  const query = { role: role || 'user' };
  if (role) query.role = role;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }
  const sortMap = {
    name_asc: { name: 1 },
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
  };
  const users = await User.find(query).sort(sortMap[sort] || sortMap.newest);
  res.json({ success: true, count: users.length, users });
});

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private (admin)
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user });
});

// @desc    Update a user's editable profile fields (name, phone). Role is
//          fixed once assigned and cannot be changed through this endpoint
//          at all - agent accounts are created directly via POST /api/agents,
//          and admin access is granted only outside the application
//          (DB/seed level).
// @route   PUT /api/users/:id
// @access  Private (admin)
const updateUser = asyncHandler(async (req, res) => {
  const { name, phone, role } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  // Roles are fixed once assigned - reject any attempt to change them with an
  // explicit 400 instead of silently ignoring the field, so anyone probing the
  // API directly learns this is not a supported operation.
  if (role !== undefined && role !== user.role) {
    await recordAudit({
      actor: req.user._id,
      targetUser: user._id,
      action: 'role_change_attempt',
      field: 'role',
      previousValue: user.role,
      newValue: role,
    });
    return res.status(400).json({
      success: false,
      message: "Role changes are not supported — a user's role is fixed once assigned.",
    });
  }

  if (name) user.name = name;
  if (phone !== undefined) user.phone = phone;

  await user.save();

  await recordAudit({
    actor: req.user._id,
    targetUser: user._id,
    action: 'update',
    field: name && phone !== undefined ? 'name,phone' : name ? 'name' : 'phone',
    previousValue: null,
    newValue: null,
  });

  res.json({ success: true, user: user.toSafeObject() });
});

// @desc    Activate / Deactivate a user account
// @route   PATCH /api/users/:id/status
// @access  Private (admin)
const toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const previousValue = user.isActive;
  user.isActive = !user.isActive;
  await user.save();
  await recordAudit({
    actor: req.user._id,
    targetUser: user._id,
    action: 'status_toggle',
    field: 'isActive',
    previousValue,
    newValue: user.isActive,
  });
  res.json({ success: true, user: user.toSafeObject() });
});

// @desc    Reset a user's password (admin action - generates a temporary password)
// @route   POST /api/users/:id/reset-password
// @access  Private (admin)
const resetPassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const tempPassword = crypto.randomBytes(4).toString('hex');
  user.password = tempPassword;
  await user.save();

  await recordAudit({
    actor: req.user._id,
    targetUser: user._id,
    action: 'reset_password',
    field: 'password',
    previousValue: null,
    newValue: '[redacted]',
  });

  // In production this would be emailed to the user instead of returned in the response
  res.json({ success: true, message: 'Password reset successfully', tempPassword });
});

// @desc    Delete a user account
// @route   DELETE /api/users/:id
// @access  Private (admin)
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  await recordAudit({
    actor: req.user._id,
    targetUser: user._id,
    action: 'delete',
    field: 'account',
    previousValue: { name: user.name, email: user.email, role: user.role },
    newValue: null,
  });

  await user.deleteOne();
  res.json({ success: true, message: 'User removed successfully' });
});

// @desc    Get users pending identity verification
// @route   GET /api/users/verifications/pending
// @access  Private (admin)
const getPendingVerifications = asyncHandler(async (req, res) => {
  const users = await User.find({ verificationStatus: 'pending' }).sort({ createdAt: 1 });
  res.json({ success: true, count: users.length, users });
});

// @desc    Approve or reject a user's identity verification
// @route   PATCH /api/users/:id/verify
// @access  Private (admin)
const verifyUser = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  if (!['verified', 'rejected'].includes(status)) {
    return res.status(400).json({ success: false, message: "Status must be 'verified' or 'rejected'" });
  }

  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  user.verificationStatus = status;
  user.verificationNote = note || '';
  user.verifiedAt = status === 'verified' ? new Date() : undefined;
  await user.save();

  res.json({ success: true, user: user.toSafeObject() });
});

module.exports = {
  getUsers,
  getUser,
  updateUser,
  toggleUserStatus,
  resetPassword,
  deleteUser,
  getPendingVerifications,
  verifyUser,
};
