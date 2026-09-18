const express = require('express');
const {
  getHeroSlides,
  getAdminHeroSlides,
  getHeroSlideById,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide,
  reorderHeroSlides,
} = require('../controllers/heroSlideController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

const heroUpload = upload.hero.fields([
  { name: 'media', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]);

// Admin writes. Auth runs BEFORE the upload middleware so unauthenticated
// requests never reach Cloudinary (unlike the legacy blog route order).
router.post('/', protect, authorize('admin'), heroUpload, createHeroSlide);

// NOTE: /admin and /reorder must stay above /:id — otherwise they are
// swallowed by the id handler below (same trap as blog /slug/:slug).
router.get('/admin', protect, authorize('admin'), getAdminHeroSlides);
router.put('/reorder', protect, authorize('admin'), reorderHeroSlides);

// Public carousel feed — no auth, eligibility filtered server-side.
router.get('/', getHeroSlides);

router.get('/:id', protect, authorize('admin'), getHeroSlideById);
router.put('/:id', protect, authorize('admin'), heroUpload, updateHeroSlide);
router.delete('/:id', protect, authorize('admin'), deleteHeroSlide);

module.exports = router;
