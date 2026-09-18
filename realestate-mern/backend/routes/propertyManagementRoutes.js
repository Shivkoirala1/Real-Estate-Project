const express = require('express');
const router = express.Router();
const { protect, authorize, requireVerified } = require('../middleware/auth');
const controller = require('../controllers/propertyManagementController');

router.use(protect);
router.post('/', requireVerified, controller.createManagementRequest);
router.post('/with-property', requireVerified, controller.createWithProperty);
router.get('/my-requests', controller.getMyManagementRequests);
router.get('/', authorize('admin'), controller.getManagementRequests);
router.get('/:id', controller.getManagementRequestById); // ownership check inside controller
router.patch('/:id/accept', authorize('admin'), controller.acceptRequest);
router.patch('/:id/decline', authorize('admin'), controller.declineRequest);
router.patch('/:id/terminate', authorize('admin'), controller.terminateManagement);
router.patch('/:id/approve-termination', authorize('admin'), controller.approveTermination);
router.patch('/:id/request-termination', controller.requestTermination); // owner request - access checked in controller
router.post('/:id/activities', controller.addActivity);
router.get('/:id/activities', controller.getActivities);
module.exports = router;
