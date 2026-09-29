import express, { Express } from 'express';
import cors from 'cors';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import roomRoutes from './routes/rooms.js';
import healthRoutes from './routes/health.js';

export function createApp(): Express {
  const app = express();

  // Middleware
  app.use(cors({
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging for observability (Kubernetes stdout logs)
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      // Don't log spammy health probes in verbose mode
      if (req.path === '/health' || req.path === '/ready') return;
      const duration = Date.now() - start;
      console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    });
    next();
  });

  // Health and Readiness probes (root and prefixed for versatility in ingress rules)
  app.use('/', healthRoutes);
  app.use('/api', healthRoutes);

  // Application REST API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/rooms', roomRoutes);

  // 404 handler for API routes
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
  });

  return app;
}
