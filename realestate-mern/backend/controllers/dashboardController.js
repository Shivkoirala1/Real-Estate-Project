const Property = require('../models/Property');
const User = require('../models/User');
const ContactForm = require('../models/ContactForm');
const Lead = require('../models/Lead');
// Spec v2 (Feature 1): pending sale verification queue size on the admin card
const Sale = require('../models/Sale');
const asyncHandler = require('../utils/asyncHandler');

// @desc    Get admin dashboard statistics
// @route   GET /api/dashboard/admin
// @access  Private (admin)
const getAdminStats = asyncHandler(async (req, res) => {
  const [
    totalProperties,
    availableProperties,
    soldProperties,
    reservedProperties,
    totalUsers,
    pendingVerifications,
    recentListings,
    newContactForms,
    totalLeads,
    activeLeads,
    agentCount,
    pendingSaleVerifications,
  ] = await Promise.all([
    Property.countDocuments({ isArchived: false }),
    Property.countDocuments({ status: 'available', isArchived: false }),
    Property.countDocuments({ status: 'sold' }),
    Property.countDocuments({ status: 'reserved', isArchived: false }),
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ verificationStatus: 'pending' }),
    Property.find({ isArchived: false }).sort({ createdAt: -1 }).limit(5).select('title price status media.coverImage createdAt'),
    ContactForm.countDocuments({ status: 'new' }),
    Lead.countDocuments({}),
    Lead.countDocuments({ stage: { $nin: ['closed', 'lost'] } }),
    User.countDocuments({ role: 'agent' }),
    Sale.countDocuments({ status: 'pending_review' }),
  ]);

  res.json({
    success: true,
    stats: {
      totalProperties,
      availableProperties,
      soldProperties,
      reservedProperties,
      totalUsers,
      pendingVerifications,
      newInquiries: newContactForms, // legacy stat name kept for existing UI
      newContactForms,
      totalLeads,
      activeLeads,
      agentCount,
      pendingSaleVerifications,
    },
    recentListings,
  });
});

// @desc    Get the logged-in user's own listing statistics
// @route   GET /api/dashboard/my
// @access  Private
const getMyStats = asyncHandler(async (req, res) => {
  const listedBy = req.user._id;

  const [total, available, sold, reserved, recentListings] = await Promise.all([
    Property.countDocuments({ listedBy }),
    Property.countDocuments({ listedBy, status: 'available' }),
    Property.countDocuments({ listedBy, status: 'sold' }),
    Property.countDocuments({ listedBy, status: 'reserved' }),
    Property.find({ listedBy }).sort({ createdAt: -1 }).limit(5).select('title price status media.coverImage createdAt'),
  ]);

  res.json({
    success: true,
    stats: { total, available, sold, reserved },
    recentListings,
  });
});

module.exports = { getAdminStats, getMyStats };
