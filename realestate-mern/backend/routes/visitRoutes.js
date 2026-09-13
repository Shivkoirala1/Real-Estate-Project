const express = require('express');
const router = express.Router();

const {
  createVisit,
  getVisits,
  getMyVisits,
  getVisitById,
  updateVisit,
  cancelMyVisit,
  convertVisitToLead,
} = require('../controllers/visitController');

const { protect, authorize } = require('../middleware/auth.js');

// All visit endpoints require authentication
router.use(protect);

// Buyer: Fetch personal visits | Admin: central queue | Agent: assigned visits
router.get('/my-visits', getMyVisits);

// Admin: unified accept - approve (when pending) + convert into a pipeline lead
router.post('/:id/convert-to-lead', authorize('admin'), convertVisitToLead);

// Base route: Create request or view the queue (admins see everything,
// agents are scoped to the visits assigned to them by the controller)
router
  .route('/')
  .post(createVisit)
  .get(authorize('admin', 'agent'), getVisits);

// Single visit interactions. PATCH: admins manage the full lifecycle,
// assigned agents may mark completion/cancellation and save notes.
router
  .route('/:id')
  .get(getVisitById)
  .patch(authorize('admin', 'agent'), updateVisit);

// Buyer self-cancellation
router.patch('/:id/cancel', cancelMyVisit);

module.exports = router;