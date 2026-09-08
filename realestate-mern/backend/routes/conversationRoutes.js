const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const { protect: auth, authorize } = require('../middleware/auth');

router.post('/', auth, conversationController.createConversation);

// User: conversations they participate in (must come before '/:id')
router.get('/my-conversations', auth, conversationController.getMyConversations);

// Admin: all conversations
router.get('/', auth, authorize('admin'), conversationController.getConversations);

// User: unread-thread badge count (must come before '/:id')
router.get('/unread-count', auth, conversationController.getUnreadCount);

router.get('/:id', auth, conversationController.getConversationById);
router.patch('/:id/messages', auth, conversationController.addMessage);
router.patch('/:id/close', auth, conversationController.closeConversation);
router.patch('/:id/reopen', auth, authorize('admin'), conversationController.reopenConversation);
router.delete('/:id', auth, authorize('admin'), conversationController.deleteConversation);

module.exports = router;
