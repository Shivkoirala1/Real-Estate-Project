const express = require('express');
const router = express.Router();
const {getAgent, createAgent, getAgents, getAgentSummary, toggleAgentStatus, deleteAgent, updateAgent} = require('../controllers/agentController');
const { protect, authorize } = require('../middleware/auth');

// ---------- Phase 4: agent roster management (admin only) ----------
router.all('*', protect)
router.get(
  '/',
  authorize('admin', 'agent'),
  getAgents
);

router.post(
  '/',
  authorize('admin'),
  createAgent
);
// Drill-down summary stays above '/:id' for clarity (distinct Express paths)
router.get('/:id/summary', authorize('admin'), getAgentSummary);
router.get('/:id',authorize('admin'), getAgent);
router.put('/:id',authorize('admin'), updateAgent);
router.patch('/:id/status',authorize('admin'), toggleAgentStatus);
router.delete('/:id',authorize('admin'), deleteAgent);

module.exports = router;
