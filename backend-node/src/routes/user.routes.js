const { Router } = require('express');
const { getMe, deactivateMe } = require('../controllers/user.controller');
const { protect } = require('../middleware/auth.middleware');

const router = Router();

router.use(protect);

router.get('/me', getMe);
router.delete('/me', deactivateMe);

module.exports = router;
