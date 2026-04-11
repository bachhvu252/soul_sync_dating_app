/**
 * src/config/jwt.js
 *
 * JWT helper utilities — sign and verify access tokens and refresh tokens.
 *
 * Access token  : short-lived (15 min), sent in Authorization header.
 * Refresh token : long-lived (7 days), sent as httpOnly cookie.
 *
 * Token blacklist (for logout) is stored in an in-memory Set locally.
 * Swap for Redis in production: `tokenBlacklist.add/has` → `redis.set/get`.
 */

const jwt = require('jsonwebtoken');

const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY = '7d';

// In-memory token blacklist (invalidated access tokens after logout).
// In production, replace with Redis + TTL-aware storage.
const tokenBlacklist = new Set();

/**
 * Generate a short-lived access token.
 * @param {{ id: string, email: string }} payload
 */
function signAccessToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
}

/**
 * Generate a long-lived refresh token.
 * @param {{ id: string }} payload
 */
function signRefreshToken(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
}

/**
 * Verify an access token. Throws if invalid or blacklisted.
 */
function verifyAccessToken(token) {
  if (tokenBlacklist.has(token)) {
    throw new Error('Token has been revoked');
  }
  return jwt.verify(token, process.env.JWT_SECRET);
}

/**
 * Verify a refresh token.
 */
function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

/**
 * Add a token to the blacklist (called on logout).
 */
function blacklistToken(token) {
  tokenBlacklist.add(token);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  blacklistToken,
};
