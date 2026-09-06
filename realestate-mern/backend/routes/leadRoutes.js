const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');
// The auth middleware exports `protect` - aliased here as `auth` to match the
// naming used throughout the lead management spec.
const { protect: auth, authorize } = require('../middleware/auth');

// ---------- Analytics & scoped lists (must be declared before '/:id') ----------
router.get('/pipeline/metrics', auth, authorize('admin', 'agent'), leadController.getPipelineMetrics);
router.get('/my-leads', auth, authorize('admin', 'agent'), leadController.getMyLeads);
router.get('/by-stage/:stage', auth, authorize('admin', 'agent'), leadController.getLeadsByStage);

// ---------- CRUD ----------
router.post('/', auth, authorize('admin', 'agent'), leadController.createLead);
router.get('/', auth, authorize('admin', 'agent'), leadController.getLeads);
router.get('/:id', auth, leadController.getLeadById);
router.patch('/:id', auth, leadController.updateLead);
router.delete('/:id', auth, authorize('admin'), leadController.deleteLead);

// ---------- Pipeline operations ----------
router.patch('/:id/stage', auth, leadController.updateLeadStage);
router.patch('/:id/assign', auth, authorize('admin'), leadController.assignLeadToAgent);
router.patch('/:id/reassign', auth, authorize('admin'), leadController.reassignLead);
router.patch('/:id/priority', auth, leadController.updateLeadPriority);
router.patch('/:id/notes', auth, leadController.updateLeadNotes);
router.patch('/:id/follow-up', auth, leadController.setFollowUpDate);
router.patch('/:id/follow-up-done', auth, leadController.markFollowUpDone);
router.get('/:id/suggested-action', auth, leadController.getSuggestedAction);

// ---------- Activity timeline ----------
router.post('/:id/activities', auth, leadController.addLeadActivity);
router.get('/:id/activities', auth, leadController.getLeadActivities);

module.exports = router;
