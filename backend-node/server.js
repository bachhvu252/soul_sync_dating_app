/**
 * server.js — SoulSync Node.js entry point.
 *
 * Boots Express, attaches Socket.IO, initialises DB, and starts listening.
 */

require('dotenv').config({ path: '../.env.local' });

const http = require('http');
const app = require('./src/app');
const { initDB } = require('./src/config/database');
const { initSockets } = require('./src/sockets');

const PORT = process.env.PORT || 3001;

async function bootstrap() {
  try {
    // 1. Connect / migrate database
    await initDB();

    // 2. Create HTTP server (needed so Socket.IO can attach)
    const server = http.createServer(app);

    // 3. Attach Socket.IO
    initSockets(server);

    // 4. Start listening
    server.listen(PORT, () => {
      console.log(`[SoulSync Node] Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[SoulSync Node] Failed to start:', err);
    process.exit(1);
  }
}

bootstrap();
