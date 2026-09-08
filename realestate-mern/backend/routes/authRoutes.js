const express = require('express');
const router = express.Router();
const {
  register,
  verifyEmail,
  resendVerification,
  sendPhoneOtp,
  verifyPhone,
  login,
  updateProfile,
  forgotPassword,
  resetPassword,
  getMe,
  changePassword,
  logout,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');

const verificationUpload = upload.verification.fields([
  { name: 'selfiePhoto', maxCount: 1 },
  { name: 'citizenshipPhotoFront', maxCount: 1 },
  { name: 'citizenshipPhotoBack', maxCount: 1 },
]);

router.post('/register', verificationUpload, register);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/send-phone-otp', protect, sendPhoneOtp);
router.post('/verify-phone', protect, verifyPhone);
router.post('/login', login);
router.put('/profile', protect, verificationUpload, updateProfile);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePassword);

module.exports = router;
