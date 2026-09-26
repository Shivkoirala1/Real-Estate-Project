const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const controller = require('../controllers/siteSettingController');

// Public read (footer, social rail, office map); mutations admin-only.
router.get('/', controller.getSiteSettings);
router.put('/', protect, authorize('admin'), controller.updateSiteSettings);

module.exports = router;
