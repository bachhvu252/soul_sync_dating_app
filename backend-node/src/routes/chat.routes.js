const { Router } = require('express');
const { listConversations, getMessages, markRead } = require('../controllers/chat.controller');
const { protect } = require('../middleware/auth.middleware');

const router = Router();

router.use(protect);

router.get('/conversations', listConversations);
router.get('/:conversationId', getMessages);
router.patch('/messages/:id/read', markRead);

module.exports = router;
