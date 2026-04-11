/**
 * src/controllers/user.controller.js
 *
 * User account management — view / deactivate own account.
 * Profile CRUD (bio, preferences, photos) is in profile.controller.js.
 */

const { User, Profile, Photo } = require('../models');

/**
 * GET /api/users/me
 * Returns authenticated user's account info + profile.
 */
const getMe = async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    include: [
      { model: Profile, as: 'profile' },
      { model: Photo, as: 'photos', order: [['order_index', 'ASC']] },
    ],
  });

  return res.json({ success: true, data: user.toSafeJSON() });
};

/**
 * DELETE /api/users/me
 * Soft-delete (deactivate) own account.
 */
const deactivateMe = async (req, res) => {
  await req.user.update({ is_active: false });
  return res.json({ success: true, data: { message: 'Account deactivated' } });
};

module.exports = { getMe, deactivateMe };
