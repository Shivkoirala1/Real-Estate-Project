const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUser,
  updateUser,
  toggleUserStatus,
  resetPassword,
  deleteUser,
  getPendingVerifications,
  verifyUser,
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

router.get('/', getUsers);
router.get('/verifications/pending', getPendingVerifications);
router.get('/:id', getUser);
router.put('/:id', updateUser);
router.patch('/:id/status', toggleUserStatus);
router.patch('/:id/verify', verifyUser);
router.post('/:id/reset-password', resetPassword);
router.delete('/:id', deleteUser);

module.exports = router;
