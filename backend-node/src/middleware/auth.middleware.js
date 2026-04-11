/**
 * src/middleware/auth.middleware.js
 *
 * JWT authentication guard for protected routes.
 * Reads the Bearer token from the Authorization header, verifies it,
 * and attaches `req.user` (the User model instance) for downstream handlers.
 *
 * Blacklisted tokens (from logout) are rejected here via the token blacklist.
 */

const { verifyAccessToken } = require('../config/jwt');
const { User } = require('../models');

/**
 * `protect` — attach to any route that requires authentication.
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Unauthorized — no token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token); // throws if invalid or blacklisted

    const user = await User.findByPk(decoded.id);
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Unauthorized — user not found or inactive' });
    }

    req.user = user;
    req.token = token; // kept so logout can blacklist it
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: `Unauthorized — ${err.message}` });
  }
};

module.exports = { protect };
