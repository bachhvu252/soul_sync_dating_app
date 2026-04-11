/**
 * src/sockets/index.js
 *
 * Socket.IO initialisation.
 *
 * Architecture:
 *  - Each authenticated user joins their own `userId` room for match notifications.
 *  - Conversations are separate named rooms (conversationId).
 *  - Authentication middleware validates the Bearer token on connection.
 *
 * Local dev: no Redis adapter (single-process).
 * Production: add `socket.io-redis` adapter for horizontal scaling.
 */

const { Server } = require('socket.io');
const { verifyAccessToken } = require('../config/jwt');
const { User } = require('../models');
const { registerChatHandlers } = require('./chat.socket');
const { registerMatchHandlers } = require('./match.socket');

let io;

/**
 * Initialise Socket.IO and attach to the HTTP server.
 * @param {import('http').Server} server
 */
function initSockets(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authentication middleware — validate Bearer token from handshake
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
      if (!token) throw new Error('No token');

      const decoded = verifyAccessToken(token);
      const user = await User.findByPk(decoded.id);
      if (!user || !user.is_active) throw new Error('User not found');

      socket.userId = user.id;
      socket.user = user;
      next();
    } catch (err) {
      next(new Error(`Authentication failed: ${err.message}`));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.userId}`);

    // Each user joins their personal room for match notifications
    socket.join(socket.userId);

    // Register domain-specific handlers
    registerChatHandlers(io, socket);
    registerMatchHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.userId}`);
    });
  });

  return io;
}

/**
 * Get the initialised Socket.IO server instance.
 * Used by controllers to emit events.
 */
function getIO() {
  if (!io) throw new Error('Socket.IO not initialised');
  return io;
}

module.exports = { initSockets, getIO };
