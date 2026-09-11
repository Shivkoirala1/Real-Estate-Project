const express = require('express');
const router = express.Router();
const archiveController = require('../controllers/archiveController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

router.get('/jobs/history', archiveController.jobHistory);
router.post('/jobs/:job/run', archiveController.runJobNow);

router.get('/', archiveController.listArchives);
router.get('/:id', archiveController.getArchive);
router.post('/:id/restore', archiveController.restoreArchive);

module.exports = router;
