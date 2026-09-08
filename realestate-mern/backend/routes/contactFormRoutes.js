const express = require('express');
const router = express.Router();
const contactFormController = require('../controllers/contactFormController');
// `protect` is aliased as `auth`; contact form submission itself stays public
// via optionalAuth so anonymous visitors can still reach the team.
const { protect: auth, optionalAuth, authorize } = require('../middleware/auth');

// Public: submit a contact form (recognizes logged-in senders when present)
router.post('/', optionalAuth, contactFormController.createContactForm);

// User: forms they sent (must come before '/:id')
router.get('/sent', auth, contactFormController.getSentContactForms);

// Admin: the central inbox
router.get('/', auth, authorize('admin'), contactFormController.getContactForms);

// Admin: turn a submission into a pipeline lead
router.post('/:id/convert-to-lead', auth, authorize('admin'), contactFormController.convertContactFormToLead);

router.get('/:id', auth, contactFormController.getContactFormById);
router.patch('/:id/status', auth, authorize('admin'), contactFormController.updateContactFormStatus);
router.patch('/:id/respond', auth, authorize('admin'), contactFormController.respondToContactForm);
router.delete('/:id', auth, authorize('admin'), contactFormController.deleteContactForm);

module.exports = router;
