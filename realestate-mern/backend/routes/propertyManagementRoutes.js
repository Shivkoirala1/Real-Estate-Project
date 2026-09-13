const express = require('express');
const router = express.Router();
const { protect, authorize, requireVerified } = require('../middleware/auth');
const controller = require('../controllers/propertyManagementController');

router.use(protect);
router.post('/', requireVerified, controller.createManagementRequest);
router.get('/my-requests', controller.getMyManagementRequests);
router.get('/assigned', authorize('agent', 'admin'), controller.getAssignedProperties);
router.get('/', authorize('admin'), controller.getManagementRequests);
router.get('/:id', controller.getManagementRequestById); // ownership check inside controller
router.patch('/:id/approve', authorize('admin'), controller.approveRequest);
router.patch('/:id/reject', authorize('admin'), controller.rejectRequest);
router.patch('/:id/assign-agent', authorize('admin'), controller.assignAgent);
router.patch('/:id/status', authorize('admin', 'agent'), controller.updateStatus);
router.patch('/:id/terminate', authorize('admin'), controller.terminateManagement);
router.patch('/:id/request-termination', controller.requestTermination); // owner request - access checked in controller
router.post('/:id/activities', controller.addActivity);
router.get('/:id/activities', controller.getActivities);
module.exports = router;
