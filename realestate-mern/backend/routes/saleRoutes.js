const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');
// The auth middleware exports `protect` - aliased here as `auth` to match the
// naming used in leadRoutes.js and the agent dashboard spec.
const { protect: auth, authorize } = require('../middleware/auth');

// ---------- Sales (Spec v2 - Feature 1: simplified sale confirmation) ----------
router.post('/', auth, authorize('admin', 'agent'), saleController.createSale);
router.get('/', auth, authorize('admin', 'agent'), saleController.getSales);
// Admin or the filing agent - the check happens in the controller (lead's
// assigned agent may also view).
router.get('/:id', auth, saleController.getSaleById);
router.patch('/:id/verify', auth, authorize('admin'), saleController.verifySale);
router.patch('/:id/reject', auth, authorize('admin'), saleController.rejectSale);

module.exports = router;
