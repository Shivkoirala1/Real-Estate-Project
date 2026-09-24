const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const uploadController = require('../controllers/uploadController');

const router = express.Router();

// Aggregates for the old-vs-new comparison (admin only). Registered before
// protect so the route table stays readable — authorize still enforced.
router.get('/metrics', protect, authorize('admin'), uploadController.metrics);

// All upload-authorization surfaces require authentication. Per-purpose
// role/verification gates live in the service layer (purpose matrix).
router.use(protect);

router.post('/session', uploadController.createSession);
router.post('/sign', uploadController.sign);
router.post('/:id/complete', uploadController.complete);
router.post('/commit', uploadController.commit);
router.delete('/:id', uploadController.remove);
router.get('/view/:id', uploadController.view);

module.exports = router;
