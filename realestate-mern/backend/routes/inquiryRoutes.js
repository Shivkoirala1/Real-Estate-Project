const express = require('express');
const router = express.Router();
const {
  createInquiry,
  getInquiries,
  getSentInquiries,
  getInquiryById,
  updateInquiryStatus,
  respondToInquiry,
  replyToInquiry,
  deleteInquiry,
} = require('../controllers/inquiryController');
const { protect, optionalAuth, authorize } = require('../middleware/auth');

// Public: submit an inquiry / contact form. optionalAuth means a logged-in
// sender still gets linked to the inquiry (so it shows up under "Sent by
// Me" and they can receive replies), while a signed-out visitor can still
// use the form.
router.post('/', optionalAuth, createInquiry);

// Any logged-in user: inquiries THEY sent (must come before '/:id' routes)
router.get('/sent', protect, getSentInquiries);

// Admin only: the central inquiry inbox. Property owners no longer have
// their own "received inquiries" view - all inquiries are handled by admins.
router.get('/', protect, authorize('admin'), getInquiries);
router.get('/:id', protect, getInquiryById);
router.patch('/:id', protect, authorize('admin'), updateInquiryStatus);
// Two-way reply: works for the admin (standing in for the property owner)
// AND the original inquirer, so both sides can keep the conversation going.
router.patch('/:id/reply', protect, replyToInquiry);
router.patch('/:id/respond', protect, respondToInquiry); // legacy alias
router.delete('/:id', protect, authorize('admin'), deleteInquiry);

module.exports = router;
