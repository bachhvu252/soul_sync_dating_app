const { Router } = require('express');
const { swipe, getSuggestions, getMatches } = require('../controllers/match.controller');
const { protect } = require('../middleware/auth.middleware');

const router = Router();

router.use(protect);

router.get('/suggestions', getSuggestions);
router.get('/list', getMatches);
router.post('/swipe', swipe);

module.exports = router;
