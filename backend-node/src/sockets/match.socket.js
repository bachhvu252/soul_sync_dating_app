/**
 * src/sockets/match.socket.js
 *
 * Socket.IO match event handlers.
 *
 * Currently this module is a placeholder for future real-time match
 * interactions (e.g., match acceptance, undo-swipe within a time window).
 *
 * The primary match:new event is emitted from the match controller when
 * a mutual like is detected — it does not need a socket handler here.
 */

function registerMatchHandlers(io, socket) {
  // Reserved for future match-specific real-time features
  // e.g., socket.on('match:undo', ...) could be added here

  // Acknowledge that the user has seen their new match notification
  socket.on('match:seen', ({ matchId }) => {
    console.log(`[Match] User ${socket.userId} acknowledged match ${matchId}`);
  });
}

module.exports = { registerMatchHandlers };
