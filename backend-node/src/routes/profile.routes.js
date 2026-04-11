const { Router } = require('express');
const {
  getProfile,
  updateProfile,
  updatePreferences,
  addPhoto,
  deletePhoto,
} = require('../controllers/profile.controller');
const { protect } = require('../middleware/auth.middleware');

const router = Router();

// Public profile view
router.get('/:id', getProfile);

// Protected profile management
router.use(protect);
router.put('/', updateProfile);
router.patch('/preferences', updatePreferences);
router.post('/photos', addPhoto);
router.delete('/photos/:photoId', deletePhoto);

module.exports = router;
