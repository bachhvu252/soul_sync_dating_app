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
  name: Joi.string().min(2).max(60),
  age: Joi.number().integer().min(18).max(100),
  gender: Joi.string().valid('male', 'female', 'non-binary', 'other'),
  bio: Joi.string().max(500).allow(''),
  location: Joi.string().max(100).allow(''),
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
      { model: Photo, as: 'photos', order: [['order_index', 'ASC']] },
      { model: User, as: 'user', attributes: ['id', 'is_active', 'is_verified'] },
    ],
  });

  if (!profile || !profile.user?.is_active) {
    return res.status(404).json({ success: false, error: 'Profile not found' });
  }

  // Exclude embedding_vector from public response
  const { embedding_vector, ...publicProfile } = profile.toJSON(); // eslint-disable-line no-unused-vars
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
    defaults: { name: value.name || 'User', age: value.age || 18, gender: value.gender || 'other' },
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

module.exports = { getProfile, updateProfile, updatePreferences, addPhoto, deletePhoto };
