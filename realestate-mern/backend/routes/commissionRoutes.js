const express = require('express');
const router = express.Router();
const commissionController = require('../controllers/commissionController');
const { protect, authorize } = require('../middleware/auth');

// Analytics before '/:id' style ordering
router.get('/', protect, authorize('admin', 'agent'), commissionController.getCommissions);
router.get('/summary', protect, authorize('admin', 'agent'), commissionController.getCommissionSummary);
router.patch('/:id/mark-paid', protect, authorize('admin'), commissionController.markCommissionPaid);

module.exports = router;
