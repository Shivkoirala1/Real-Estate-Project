const express = require('express');
const router = express.Router();
const {
  getProperties,
  getProperty,
  createProperty,
  updateProperty,
  updatePropertyStatus,
  endTenancy,
  requestEndTenancy,
  approveEndTenancy,
  declineEndTenancy,
  deleteProperty,
  getMyProperties,
  toggleFavorite,
  getFavorites,
  shareProperty,
} = require('../controllers/propertyController');
const { protect, optionalAuth, requireVerified, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const propertyUpload = upload.fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'images', maxCount: 15 },
]);

// Public routes - anyone (including guests) can browse the feed.
// optionalAuth attaches the viewer (if logged in) so commission visibility
// can be applied per-role without requiring authentication to browse.
router.get('/', optionalAuth, getProperties);

// Logged-in scoped routes (must be defined before the /:id catch-all)
router.get('/my/listings', protect, getMyProperties);
router.get('/my/favorites', protect, getFavorites);

router.get('/:id', optionalAuth, getProperty);

// Posting a property requires a verified identity (or admin)
router.post('/', protect, requireVerified, propertyUpload, createProperty);
router.put('/:id', protect, requireVerified, propertyUpload, updateProperty);
router.patch('/:id/status', protect, requireVerified, updatePropertyStatus);
router.patch('/:id/end-tenancy', protect, requireVerified, endTenancy);
// Owner-requested end of tenancy (admin approval required)
router.patch('/:id/request-end-tenancy', protect, requireVerified, requestEndTenancy);
router.patch('/:id/approve-end-tenancy', protect, requireVerified, authorize('admin'), approveEndTenancy);
router.patch('/:id/decline-end-tenancy', protect, requireVerified, authorize('admin'), declineEndTenancy);
router.delete('/:id', protect, requireVerified, deleteProperty);

// Any registered user - favorites
router.post('/:id/favorite', protect, toggleFavorite);
router.post('/:id/share', protect, shareProperty);

module.exports = router;
