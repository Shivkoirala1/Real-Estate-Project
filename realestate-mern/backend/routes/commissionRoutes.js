const express = require('express');
const router = express.Router();
const commissionController = require('../controllers/commissionController');
const { protect, authorize } = require('../middleware/auth');

// Analytics before '/:id' style ordering
router.get('/', protect, authorize('admin', 'agent'), commissionController.getCommissions);
router.get('/summary', protect, authorize('admin', 'agent'), commissionController.getCommissionSummary);
router.patch('/:id/pay-phase-1', protect, authorize('admin'), commissionController.payPhase1);
router.patch('/:id/pay-phase-2', protect, authorize('admin'), commissionController.payPhase2);
// DEPRECATED compatibility alias (settles remaining phases in order).
// Removed next release - new callers must use pay-phase-1 / pay-phase-2.
router.patch('/:id/mark-paid', protect, authorize('admin'), commissionController.markCommissionPaid);

module.exports = router;
