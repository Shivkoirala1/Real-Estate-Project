const express = require('express');
const router = express.Router();
const emiPlanController = require('../controllers/emiPlanController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.post('/', authorize('admin'), emiPlanController.createEmiPlan);
router.get('/', authorize('admin'), emiPlanController.getEmiPlans);
// Detail also allows the linked buyer (role 'user') - checked inside the controller
router.get('/:id', emiPlanController.getEmiPlanById);
router.patch('/:id', authorize('admin'), emiPlanController.updateEmiPlan);
router.patch('/:id/installments/:n', authorize('admin'), emiPlanController.updateInstallment);

module.exports = router;
