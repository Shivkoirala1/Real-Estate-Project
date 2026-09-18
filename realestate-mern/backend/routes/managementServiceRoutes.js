const express = require('express');
const router = express.Router();
const { protect, optionalAuth, authorize } = require('../middleware/auth');
const controller = require('../controllers/managementServiceController');

// Catalogue is public so visitors can browse available services.
// Mutations remain admin-only.
router.get('/', optionalAuth, controller.getManagementServices);
router.post('/', protect, authorize('admin'), controller.createManagementService);
router.patch('/:id', protect, authorize('admin'), controller.updateManagementService);
router.patch('/:id/status', protect, authorize('admin'), controller.setManagementServiceStatus);
module.exports = router;
