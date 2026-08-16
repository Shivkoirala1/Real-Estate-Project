const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const crypto = require('crypto');

// @desc    Get all users (with optional role filter)
// @route   GET /api/users
// @access  Private (admin)
const getUsers = asyncHandler(async (req, res) => {
  const { role, search } = req.query;
  const query = {};
  if (role) query.role = role;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }
  const users = await User.find(query).sort({ createdAt: -1 });
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

// @desc    Promote a user to admin (or demote back to user)
// @route   PUT /api/users/:id
// @access  Private (admin)
const updateUser = asyncHandler(async (req, res) => {
  const { name, phone, role } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  if (name) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (role && ['user', 'admin'].includes(role)) user.role = role;

  await user.save();
  res.json({ success: true, user: user.toSafeObject() });
});

// @desc    Activate / Deactivate a user account
// @route   PATCH /api/users/:id/status
// @access  Private (admin)
const toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  user.isActive = !user.isActive;
  await user.save();
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

  // In production this would be emailed to the user instead of returned in the response
  res.json({ success: true, message: 'Password reset successfully', tempPassword });
});

// @desc    Delete a user account
// @route   DELETE /api/users/:id
// @access  Private (admin)
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

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
