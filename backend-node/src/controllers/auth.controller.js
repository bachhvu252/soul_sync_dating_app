/**
 * src/controllers/auth.controller.js
 *
 * Handles user registration, login, token refresh, and logout.
 *
 * Auth flow:
 *  - Register : hash password with bcrypt (cost 12), create User + Profile rows.
 *  - Login    : verify credentials, issue access token (15m) + refresh token (7d httpOnly cookie).
 *  - Refresh  : validate refresh token from cookie, rotate both tokens.
 *  - Logout   : blacklist current access token.
 */

const bcrypt = require('bcryptjs');
const Joi = require('joi');
const { User, Profile } = require('../models');
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  blacklistToken,
} = require('../config/jwt');

// ── Validation schemas ──────────────────────────────────────────────────────

const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).max(60).required(),
  age: Joi.number().integer().min(18).max(100).required(),
  gender: Joi.string().valid('male', 'female', 'non-binary', 'other').required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'Strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

function setRefreshTokenCookie(res, token) {
  res.cookie('refreshToken', token, COOKIE_OPTIONS);
}

// ── Controller ──────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 */
const register = async (req, res) => {
  const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, error: error.details.map((d) => d.message).join('; ') });
  }

  const { email, password, name, age, gender } = value;

  // Check for existing email
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    return res.status(409).json({ success: false, error: 'Email already registered' });
  }

  // Hash password — bcrypt cost factor 12
  const password_hash = await bcrypt.hash(password, 12);

  // Create user + profile in a transaction
  const { sequelize } = require('../config/database');
  const result = await sequelize.transaction(async (t) => {
    const user = await User.create({ email, password_hash }, { transaction: t });
    const profile = await Profile.create(
      { user_id: user.id, name, age, gender },
      { transaction: t },
    );
    return { user, profile };
  });

  const accessToken = signAccessToken({ id: result.user.id, email });
  const refreshToken = signRefreshToken({ id: result.user.id });

  setRefreshTokenCookie(res, refreshToken);

  return res.status(201).json({
    success: true,
    data: {
      user: result.user.toSafeJSON(),
      accessToken,
    },
  });
};

/**
 * POST /api/auth/login
 */
const login = async (req, res) => {
  const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
  if (error) {
    return res.status(400).json({ success: false, error: error.details.map((d) => d.message).join('; ') });
  }

  const { email, password } = value;

  const user = await User.findOne({ where: { email } });
  if (!user) {
    // Constant-time response to avoid user enumeration
    await bcrypt.compare(password, '$2a$12$invalidhashpadding000000000000000000000000000000000000000');
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  if (!user.is_active) {
    return res.status(403).json({ success: false, error: 'Account is deactivated' });
  }

  const accessToken = signAccessToken({ id: user.id, email: user.email });
  const refreshToken = signRefreshToken({ id: user.id });

  setRefreshTokenCookie(res, refreshToken);

  return res.json({
    success: true,
    data: {
      user: user.toSafeJSON(),
      accessToken,
    },
  });
};

/**
 * POST /api/auth/refresh
 * Reads the httpOnly cookie, validates it, and rotates both tokens.
 */
const refresh = async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    return res.status(401).json({ success: false, error: 'No refresh token' });
  }

  try {
    const decoded = verifyRefreshToken(token);
    const user = await User.findByPk(decoded.id);
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    const newAccessToken = signAccessToken({ id: user.id, email: user.email });
    const newRefreshToken = signRefreshToken({ id: user.id });

    setRefreshTokenCookie(res, newRefreshToken);

    return res.json({ success: true, data: { accessToken: newAccessToken } });
  } catch {
    return res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
  }
};

/**
 * POST /api/auth/logout
 * Blacklists the current access token and clears the refresh cookie.
 */
const logout = (req, res) => {
  blacklistToken(req.token);
  res.clearCookie('refreshToken', COOKIE_OPTIONS);
  return res.json({ success: true, data: null });
};

module.exports = { register, login, refresh, logout };
