const { Router } = require('express');
const {
  getProfile,
  updateProfile,
  updatePreferences,
  addPhoto,
  uploadPhoto,
  deletePhoto,
} = require('../controllers/profile.controller');
const { protect } = require('../middleware/auth.middleware');
const multer = require('multer');

const upload = multer({ storage: multer.memoryStorage() });


const router = Router();

// Public profile view
router.get('/:id', getProfile);

// Protected profile management
router.use(protect);
router.put('/', updateProfile);
router.patch('/preferences', updatePreferences);
router.post('/photos', addPhoto);
router.post('/upload', upload.single('file'), uploadPhoto);
router.delete('/photos/:photoId', deletePhoto);

module.exports = router;
