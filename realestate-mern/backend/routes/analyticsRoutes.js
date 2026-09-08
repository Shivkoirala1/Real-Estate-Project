const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { protect, authorize } = require('../middleware/auth');

// ---------- Feature 4: analytics & report exports ----------
router.get('/admin', protect, authorize('admin'), analyticsController.getAdminAnalytics);
// Agent sees own numbers; admin may narrow with ?agent=<id> (controller-side)
router.get('/agent', protect, authorize('admin', 'agent'), analyticsController.getAgentAnalytics);
router.get('/export', protect, authorize('admin', 'agent'), analyticsController.exportAnalytics);

module.exports = router;
