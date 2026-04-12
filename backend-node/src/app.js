/**
 * src/app.js — Express application factory.
 *
 * Registers global middleware (CORS, JSON parsing, rate limiting, logging)
 * and mounts all route groups. Does NOT start the HTTP server — that is
 * done in server.js so Socket.IO can share the same http.Server instance.
 */

const express = require('express');
require('express-async-errors'); // Catches unhandled async errors in route handlers
const cookieParser = require('cookie-parser');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const profileRoutes = require('./routes/profile.routes');
const matchRoutes = require('./routes/match.routes');
const chatRoutes = require('./routes/chat.routes');
const safetyRoutes = require('./routes/safety.routes');
const { authRateLimiter } = require('./middleware/rateLimit.middleware');

const app = express();

// ----- Global Middleware -----

app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ];
    // Allow requests with no origin (curl, Postman, same-origin)
    if (!origin || allowed.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Serve uploaded files as static assets (local dev only)
const uploadsDir = path.resolve(process.env.UPLOADS_DIR || './uploads');
app.use('/uploads', express.static(uploadsDir));

// ----- Routes -----

// Rate limiter applied specifically to auth endpoints (10 req/min per IP)
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/match', matchRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/safety', safetyRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'soulsync-node' }));

// 404 handler
app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found' }));

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[Error]', err);
  const status = err.status || 500;
  res.status(status).json({ success: false, error: err.message || 'Internal server error' });
});

module.exports = app;
