const express = require('express');
const router = express.Router();
const emiPlanController = require('../controllers/emiPlanController');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.use(protect);

router.post('/', authorize('admin'), emiPlanController.createEmiPlan);
// Verified EMI sales still missing a plan - feeds the admin's
// 'Initialize EMI Plan' picker. Must be registered before /:id so
// 'eligible-sales' is not swallowed as a plan id.
router.get('/eligible-sales', authorize('admin'), emiPlanController.getEligibleEmiSales);
// List: admin sees all, agent sees their managed plans (read-only, amounts
// stripped), buyer sees their own plans - role branching happens inside.
router.get('/', authorize('admin', 'agent', 'user'), emiPlanController.getEmiPlans);
// Detail also allows the assigned agent (read-only) and the linked buyer
// (role 'user') - checked inside the controller.
router.get('/:id', emiPlanController.getEmiPlanById);
router.patch('/:id', authorize('admin'), emiPlanController.updateEmiPlan);
router.patch('/:id/installments/:n', authorize('admin'), emiPlanController.updateInstallment);

// Buyer submits proof of payment for one installment (optional slip photo)
router.post(
  '/:id/installments/:n/verification-request',
  authorize('user'),
  upload.paymentSlip.single('paymentSlip'),
  emiPlanController.requestInstallmentVerification
);
// Admin approves/rejects that request
router.patch(
  '/:id/installments/:n/verification-request',
  authorize('admin'),
  emiPlanController.reviewInstallmentVerification
);

module.exports = router;
