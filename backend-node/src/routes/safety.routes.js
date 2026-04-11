const { Router } = require('express');
const { reportUser, blockUser, unblockUser } = require('../controllers/safety.controller');
const { protect } = require('../middleware/auth.middleware');

const router = Router();

router.use(protect);

router.post('/report', reportUser);
router.post('/block', blockUser);
router.delete('/block/:userId', unblockUser);

module.exports = router;
