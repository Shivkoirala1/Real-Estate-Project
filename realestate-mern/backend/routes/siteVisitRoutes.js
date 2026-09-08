const express = require('express');
const router = express.Router();
const { bookVisit, getMyVisits, getReceivedVisits, updateVisitStatus } = require('../controllers/siteVisitController');
const { protect } = require('../middleware/auth');

router.post('/', protect, bookVisit);
router.get('/my', protect, getMyVisits);
router.get('/received', protect, getReceivedVisits);
router.patch('/:id/status', protect, updateVisitStatus);

module.exports = router;
