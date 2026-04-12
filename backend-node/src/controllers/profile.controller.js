/**
 * src/controllers/profile.controller.js
 *
 * Profile management — view public profile, update own profile, manage photos.
 *
 * Photo upload flow:
 *  1. Client POSTs multipart/form-data to Flask media service (separate).
 *  2. Flask returns { url, thumbnailUrl }.
 *  3. Client calls POST /api/profile/photos with those URLs to persist in DB.
 */

const Joi = require('joi');
const { Profile, Photo, User } = require('../models');

// ── Schemas ──────────────────────────────────────────────────────────────────

const updateProfileSchema = Joi.object({
  first_name: Joi.string().min(2).max(60),
  last_name: Joi.string().max(60).allow('', null),
  date_of_birth: Joi.string().isoDate().allow(null),
  gender: Joi.string().valid('male', 'female', 'non_binary', 'prefer_not_to_say', 'other'),
  bio: Joi.string().max(500).allow(''),
  location: Joi.string().max(255).allow(''),
  interest_tags: Joi.array().items(Joi.string().max(50)).max(20),
  prompts_json: Joi.array().items(
    Joi.object({
      label: Joi.string().max(100).required(),
      text: Joi.string().max(300).required()
    })
  ).max(5),
  personal_details_json: Joi.object().pattern(
    Joi.string().max(50), 
    Joi.string().max(100).allow('')
  )
}).min(1);

const updatePreferencesSchema = Joi.object({
  ageMin: Joi.number().integer().min(18).max(100),
  ageMax: Joi.number().integer().min(18).max(100),
  genderPreference: Joi.string().valid('male', 'female', 'non-binary', 'other', 'any'),
  maxDistanceKm: Joi.number().integer().min(1).max(500),
  interests: Joi.array().items(Joi.string().max(50)).max(20),
}).min(1);

const addPhotoSchema = Joi.object({
  url: Joi.string().uri().required(),
  thumbnailUrl: Joi.string().uri().allow('', null),
  isPrimary: Joi.boolean().default(false),
});

// ── Controller ───────────────────────────────────────────────────────────────

/**
 * GET /api/profile/:id
 * Returns a public profile view (no sensitive data).
 */
const getProfile = async (req, res) => {
  const profile = await Profile.findOne({
    where: { user_id: req.params.id },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'is_active', 'is_verified'],
        include: [{ model: Photo, as: 'photos' }],
      },
    ],
    order: [[{ model: User, as: 'user' }, { model: Photo, as: 'photos' }, 'order_index', 'ASC']],
  });

  if (!profile || !profile.user?.is_active) {
    return res.status(404).json({ success: false, error: 'Profile not found' });
  }

  // Exclude embedding_vector from public response; hoist photos to top level
  const json = profile.toJSON();
  const { embedding_vector, user, ...publicProfile } = json; // eslint-disable-line no-unused-vars
  publicProfile.photos = user?.photos || [];
  publicProfile.user = { id: user.id, is_active: user.is_active, is_verified: user.is_verified };
  return res.json({ success: true, data: publicProfile });
};

/**
 * PUT /api/profile
 * Update authenticated user's own profile.
 */
const updateProfile = async (req, res) => {
  const { error, value } = updateProfileSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({ success: false, error: error.details.map((d) => d.message).join('; ') });
  }

  const [profile] = await Profile.findOrCreate({
    where: { user_id: req.user.id },
    defaults: { first_name: value.first_name || 'User', gender: value.gender || 'other' },
  });

  await profile.update(value);
  return res.json({ success: true, data: profile });
};

/**
 * PATCH /api/profile/preferences
 * Update matching preferences only.
 */
const updatePreferences = async (req, res) => {
  const { error, value } = updatePreferencesSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    return res.status(400).json({ success: false, error: error.details.map((d) => d.message).join('; ') });
  }

  const profile = await Profile.findOne({ where: { user_id: req.user.id } });
  if (!profile) {
    return res.status(404).json({ success: false, error: 'Profile not found — complete your profile first' });
  }

  const current = profile.preferences_json || {};
  await profile.update({ preferences_json: { ...current, ...value } });

  return res.json({ success: true, data: profile.preferences_json });
};

/**
 * POST /api/profile/photos
 * Persist a photo URL returned by the Flask media service.
 */
const addPhoto = async (req, res) => {
  const { error, value } = addPhotoSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, error: error.details.map((d) => d.message).join('; ') });
  }

  // Count existing photos
  const count = await Photo.count({ where: { user_id: req.user.id } });
  if (count >= 6) {
    return res.status(400).json({ success: false, error: 'Maximum 6 photos allowed' });
  }

  // If setting primary, clear other primaries first
  if (value.isPrimary) {
    await Photo.update({ is_primary: false }, { where: { user_id: req.user.id } });
  }

  const photo = await Photo.create({
    user_id: req.user.id,
    url: value.url,
    thumbnail_url: value.thumbnailUrl || null,
    is_primary: value.isPrimary,
    order_index: count,
  });

  return res.status(201).json({ success: true, data: photo });
};

/**
 * POST /api/profile/upload
 * Accept multipart/form-data, forward to Flask, and save Photo model.
 */
const uploadPhoto = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  // Count existing photos to enforce max 6
  const count = await Photo.count({ where: { user_id: req.user.id } });
  if (count >= 6) {
    return res.status(400).json({ success: false, error: 'Maximum 6 photos allowed' });
  }

  // 1. Forward file to Flask media service
  const flaskUrl = process.env.FLASK_BASE_URL || 'http://localhost:5001';
  const formData = new FormData();
  
  const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
  // Add originalname as filename arg using standard approach for JS FormData
  formData.append('file', blob, req.file.originalname);

  try {
    const flaskRes = await fetch(`${flaskUrl}/api/media/upload`, {
      method: 'POST',
      headers: {
        'X-Internal-Secret': process.env.INTERNAL_API_SECRET || '',
      },
      body: formData,
    });

    const body = await flaskRes.json();
    if (!flaskRes.ok || !body.success) {
      throw new Error(body.error || 'Flask returned an error');
    }

    const { url, thumbnailUrl } = body.data;

    // 2. Persist in Node DB
    const photo = await Photo.create({
      user_id: req.user.id,
      url,
      thumbnail_url: thumbnailUrl,
      is_primary: count === 0, // auto primary if first photo
      order_index: count,
    });

    return res.status(201).json({ success: true, data: photo });

  } catch (err) {
    console.error('[Upload Proxy Error]', err);
    return res.status(500).json({ success: false, error: 'Failed to process image: ' + err.message });
  }
};

/**
 * DELETE /api/profile/photos/:photoId
 * Remove a photo (only allowed for owner).
 */
const deletePhoto = async (req, res) => {
  const photo = await Photo.findOne({ where: { id: req.params.photoId, user_id: req.user.id } });
  if (!photo) {
    return res.status(404).json({ success: false, error: 'Photo not found' });
  }

  await photo.destroy();
  return res.json({ success: true, data: { message: 'Photo deleted' } });
};

module.exports = { getProfile, updateProfile, updatePreferences, addPhoto, uploadPhoto, deletePhoto };
