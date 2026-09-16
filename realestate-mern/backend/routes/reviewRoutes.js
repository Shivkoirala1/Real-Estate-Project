const express = require('express');
const router = express.Router();
const {
  checkEligibility,
  getPropertyReviews,
  createReview,
  getAdminReviews,
  replyToReview,
  toggleReviewVisibility,
  deleteReview,
} = require('../controllers/reviewController');
const { protect, authorize } = require('../middleware/auth');

// Admin moderation dashboard (must come before any ambiguous single-segment
// routes so 'admin' is never treated as a review id)
router.get('/admin', protect, authorize('admin'), getAdminReviews);

router.get('/eligibility/:propertyId', protect, checkEligibility);
router.get('/property/:propertyId', getPropertyReviews);

router.post('/', protect, createReview);
router.post('/:id/reply', protect, authorize('admin'), replyToReview);
router.patch('/:id/visibility', protect, authorize('admin'), toggleReviewVisibility);
router.delete('/:id', protect, deleteReview);

module.exports = router;
