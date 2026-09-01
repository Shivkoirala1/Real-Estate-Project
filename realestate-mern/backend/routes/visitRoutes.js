const express = require('express');
const router = express.Router();

const {
  createVisit,
  getVisits,
  getMyVisits,
  getVisitById,
  updateVisit,
  cancelMyVisit,
} = require('../controllers/visitController');

const { protect, authorize } = require('../middleware/auth.js');

// All visit endpoints require authentication
router.use(protect);

// Buyer: Fetch personal visits | Admin: Fetch central moderation queue
router.get('/my-visits', getMyVisits);

// Base route: Create request or view overall queue
router
  .route('/')
  .post(createVisit)
  .get(authorize('admin'), getVisits);

// Single visit interactions
router
  .route('/:id')
  .get(getVisitById)
  .patch(authorize('admin'), updateVisit);

// Buyer self-cancellation
router.patch('/:id/cancel', cancelMyVisit);

module.exports = router;