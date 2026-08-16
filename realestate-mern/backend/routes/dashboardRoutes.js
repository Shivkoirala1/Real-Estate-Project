const express = require('express');
const router = express.Router();
const { getAdminStats, getMyStats } = require('../controllers/dashboardController');
const { protect, authorize } = require('../middleware/auth');

router.get('/admin', protect, authorize('admin'), getAdminStats);
router.get('/my', protect, getMyStats);

module.exports = router;
