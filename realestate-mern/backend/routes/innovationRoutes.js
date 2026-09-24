const express = require('express');
const {
  createInnovation,
  getPublicInnovations,
  getMyInnovations,
  updateInnovation,
  deleteInnovation,
  getAdminInnovations,
  toggleVisibility,
} = require('../controllers/innovationController');
const { protect, requireVerified, authorize } = require('../middleware/auth');

const router = express.Router();

// Static routes first — otherwise they are swallowed by /:id below
// (same trap as hero /admin + /reorder and blog /slug/:slug).
// Public feed — no auth, hidden ideas filtered server-side.
router.get('/public', getPublicInnovations);
// Owner feed — any authenticated user, both visibilities.
router.get('/mine', protect, getMyInnovations);
// Admin inbox — visible + hidden, search + visibility filter.
router.get('/admin', protect, authorize('admin'), getAdminInnovations);

// Submit — verified users and admins only. requireVerified blocks
// unverified accounts; authorize blocks agents (verified or not).
router.post('/', protect, requireVerified, authorize('user', 'admin'), createInnovation);

// Edit — owner or admin (ownership checked in the controller).
router.put('/:id', protect, requireVerified, authorize('user', 'admin'), updateInnovation);
// Delete — owner or admin. Same gates as edit: unverified accounts and
// agents cannot delete (matrix parity with PUT).
router.delete('/:id', protect, requireVerified, authorize('user', 'admin'), deleteInnovation);
// Hide/show — admin only. No approval workflow in V1.
router.patch('/:id/visibility', protect, authorize('admin'), toggleVisibility);

module.exports = router;
