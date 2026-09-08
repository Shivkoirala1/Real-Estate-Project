const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const { protect, authorize } = require('../middleware/auth');

// ---------- Phase 4: agent roster management (admin only) ----------
router.use(protect, authorize('admin'));

router.get('/', agentController.getAgents);
router.post('/', agentController.createAgent);
// Drill-down summary stays above '/:id' for clarity (distinct Express paths)
router.get('/:id/summary', agentController.getAgentSummary);
router.get('/:id', agentController.getAgent);
router.put('/:id', agentController.updateAgent);
router.patch('/:id', agentController.updateAgent);
router.patch('/:id/status', agentController.toggleAgentStatus);
router.delete('/:id', agentController.deleteAgent);

module.exports = router;
