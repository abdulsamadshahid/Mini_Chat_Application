import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { createApp } from './backend/src/app.ts';
import { config } from './backend/src/config.ts';
import { initDatabase, closeDatabase } from './backend/src/database/db.ts';
import { setupWebSocket } from './backend/src/websocket/socket.ts';
import { closeRedis } from './backend/src/services/redis.ts';

const PORT = config.port || 3000;
const isProd = process.env.NODE_ENV === 'production';

async function bootstrap() {
  console.log('--------------------------------------------------');
  console.log(`[MiniChat] Bootstrapping full-stack server (Port: ${PORT}, Mode: ${isProd ? 'production' : 'development'})...`);
  console.log('--------------------------------------------------');

  // 1. Initialize DB (PostgreSQL or fallback store)
  await initDatabase();

  // 2. Instantiate backend Express app
  const app = createApp();
  const server = http.createServer(app);

  // 3. Attach Socket.IO
  const io = await setupWebSocket(server);

  // 4. Mount Vite middleware for dev or static files for prod
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });

    app.use(vite.middlewares);
    console.log('[MiniChat] Vite middleware attached for live frontend development.');
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
      console.log('[MiniChat] Serving production assets from ./dist');
    }
  }

  // 5. Start listening
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[MiniChat] Server running at http://0.0.0.0:${PORT}`);
    console.log(`[MiniChat] Liveness Probe:  http://0.0.0.0:${PORT}/health`);
    console.log(`[MiniChat] Readiness Probe: http://0.0.0.0:${PORT}/ready`);
    console.log('--------------------------------------------------');
  });

  // Graceful shutdown
  const shutdown = async (sig: string) => {
    console.log(`\n[MiniChat] Caught ${sig}, shutting down...`);
    server.close(async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await closeRedis();
      await closeDatabase();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[MiniChat] Startup error:', err);
  process.exit(1);
});
