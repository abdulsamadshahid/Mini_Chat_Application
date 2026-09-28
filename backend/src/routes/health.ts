import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../database/db.js';
import { checkRedisHealth } from '../services/redis.js';

const router = Router();

const startTime = new Date();

/**
 * GET /health - Kubernetes Liveness Probe
 * Indicates whether the Node.js application process is alive and responsive.
 * MUST NOT depend on database or external services.
 */
router.get('/health', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /ready - Kubernetes Readiness Probe
 * Indicates whether the backend instance is fully prepared to receive traffic.
 * Checks connectivity to PostgreSQL and Redis.
 */
router.get('/ready', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [dbHealthy, redisHealthy] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);

    const isReady = dbHealthy && redisHealthy;

    const payload = {
      status: isReady ? 'ready' : 'unhealthy',
      checks: {
        database: dbHealthy ? 'connected' : 'disconnected',
        redis: redisHealthy ? 'connected' : 'disconnected',
      },
      uptime: process.uptime(),
      startedAt: startTime.toISOString(),
      timestamp: new Date().toISOString(),
    };

    if (isReady) {
      res.status(200).json(payload);
    } else {
      res.status(503).json(payload);
    }
  } catch (err: any) {
    res.status(503).json({
      status: 'error',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
