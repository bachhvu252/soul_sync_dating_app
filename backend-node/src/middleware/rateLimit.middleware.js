/**
 * src/middleware/rateLimit.middleware.js
 *
 * Rate limiters using express-rate-limit.
 *
 * `authRateLimiter` — max 10 requests per minute per IP on auth endpoints.
 * This guards against brute-force login attempts.
 *
 * In production with multiple Node instances, swap the in-memory store for
 * a shared Redis store (e.g. `rate-limit-redis`).
 */

const rateLimit = require('express-rate-limit');

const authRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests — please try again in a minute.',
  },
});

const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests.',
  },
});

module.exports = { authRateLimiter, apiRateLimiter };
