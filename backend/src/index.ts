import http from 'http';
import { createApp } from './app.js';
import { config } from './config.js';
import { initDatabase, closeDatabase } from './database/db.js';
import { setupWebSocket } from './websocket/socket.js';
import { closeRedis } from './services/redis.js';

async function startServer() {
  console.log('--------------------------------------------------');
  console.log(`Starting MiniChat Backend in ${config.nodeEnv.toUpperCase()} mode...`);
  console.log('--------------------------------------------------');

  // 1. Initialize Database connection & migrations
  await initDatabase();

  // 2. Build Express application
  const app = createApp();

  // 3. Create HTTP server & attach WebSockets
  const server = http.createServer(app);
  const io = await setupWebSocket(server);

  // 4. Start listening on configured PORT
  server.listen(config.port, '0.0.0.0', () => {
    console.log(`[MiniChat Backend] Listening on http://0.0.0.0:${config.port}`);
    console.log(`[MiniChat Backend] Liveness probe:  http://0.0.0.0:${config.port}/health`);
    console.log(`[MiniChat Backend] Readiness probe: http://0.0.0.0:${config.port}/ready`);
    console.log('--------------------------------------------------');
  });

  // 5. Graceful Shutdown (Kubernetes SIGTERM / Container lifecycle management)
  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[MiniChat Backend] Received ${signal}. Initiating graceful shutdown...`);

    // Give existing requests a deadline to complete
    const forceExitTimeout = setTimeout(() => {
      console.error('[MiniChat Backend] Graceful shutdown timed out. Forcing process exit.');
      process.exit(1);
    }, 10000);

    try {
      // Stop accepting new connections
      server.close(async () => {
        console.log('[MiniChat Backend] HTTP server closed to new requests.');

        // Close Socket.IO
        await new Promise<void>((resolve) => io.close(() => resolve()));
        console.log('[MiniChat Backend] WebSocket connections terminated.');

        // Close Redis connections
        await closeRedis();

        // Close PostgreSQL pool
        await closeDatabase();

        clearTimeout(forceExitTimeout);
        console.log('[MiniChat Backend] Clean shutdown completed successfully. Exiting.');
        process.exit(0);
      });
    } catch (err) {
      console.error('[MiniChat Backend] Error during graceful shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[MiniChat Backend] Fatal error during startup:', err);
  process.exit(1);
});
