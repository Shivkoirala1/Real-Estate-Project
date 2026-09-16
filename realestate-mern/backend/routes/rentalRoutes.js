// routes/rentalRoutes.js
const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const {
  createRental, getRentals, getRentalById, verifyRental, rejectRental,
} = require('../controllers/rentalController');

router.route('/')
  .get(protect, authorize('admin', 'agent'), getRentals)
  .post(protect, authorize('admin', 'agent'), createRental);

router.route('/:id').get(protect, authorize('admin', 'agent'), getRentalById);

router.patch('/:id/verify', protect, authorize('admin'), verifyRental);
router.patch('/:id/reject', protect, authorize('admin'), rejectRental);

module.exports = router;