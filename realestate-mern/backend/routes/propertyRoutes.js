const express = require('express');
const router = express.Router();
const {
  getProperties,
  getProperty,
  createProperty,
  updateProperty,
  updatePropertyStatus,
  deleteProperty,
  getMyProperties,
  toggleFavorite,
  getFavorites,
} = require('../controllers/propertyController');
const { protect, requireVerified } = require('../middleware/auth');
const upload = require('../middleware/upload');

const propertyUpload = upload.fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'images', maxCount: 15 },
]);

// Public routes - anyone (including guests) can browse the feed
router.get('/', getProperties);

// Logged-in scoped routes (must be defined before the /:id catch-all)
router.get('/my/listings', protect, getMyProperties);
router.get('/my/favorites', protect, getFavorites);

router.get('/:id', getProperty);

// Posting a property requires a verified identity (or admin)
router.post('/', protect, requireVerified, propertyUpload, createProperty);
router.put('/:id', protect, requireVerified, propertyUpload, updateProperty);
router.patch('/:id/status', protect, requireVerified, updatePropertyStatus);
router.delete('/:id', protect, requireVerified, deleteProperty);

// Any registered user - favorites
router.post('/:id/favorite', protect, toggleFavorite);

module.exports = router;
