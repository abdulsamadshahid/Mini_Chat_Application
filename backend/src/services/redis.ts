import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { config } from '../config.js';

let pubClient: Redis | null = null;
let subClient: Redis | null = null;
let isRedisConnected = false;

// Fallback in-memory event bus and presence set for standalone dev mode
const localBus = new EventEmitter();
const memoryPresence = new Set<string>();

export async function initRedis(): Promise<{ pubClient: Redis | null; subClient: Redis | null; isConnected: boolean }> {
  if (config.redisUrl) {
    try {
      console.log(`[Redis] Connecting to Redis instance at ${config.redisUrl}...`);
      pubClient = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 5) {
            console.warn('[Redis] Max reconnect attempts reached. Operating in standalone mode.');
            return null;
          }
          return Math.min(times * 100, 2000);
        },
      });

      subClient = pubClient.duplicate();

      await new Promise<void>((resolve, reject) => {
        let isResolved = false;
        pubClient!.once('ready', () => {
          isResolved = true;
          isRedisConnected = true;
          console.log('[Redis] Connected and ready for Pub/Sub & state synchronization.');
          resolve();
        });
        pubClient!.once('error', (err: any) => {
          if (!isResolved) {
            console.warn(`[Redis] Initial connection error: ${err.message}. Running in fallback mode.`);
            reject(err);
          }
        });
        setTimeout(() => {
          if (!isResolved) {
            console.warn('[Redis] Connection timed out after 3s. Falling back to local bus.');
            reject(new Error('Redis connection timeout'));
          }
        }, 3000);
      });

      return { pubClient, subClient, isConnected: true };
    } catch (err: any) {
      console.warn(`[Redis] Connection failed (${err.message}). Using local in-memory event bus.`);
      isRedisConnected = false;
      if (pubClient) {
        pubClient.disconnect();
        pubClient = null;
      }
      if (subClient) {
        subClient.disconnect();
        subClient = null;
      }
    }
  } else {
    console.log('[Redis] No REDIS_URL configured. Running with in-memory Pub/Sub and presence.');
    isRedisConnected = false;
  }

  return { pubClient: null, subClient: null, isConnected: false };
}

export function getRedisClients() {
  return { pubClient, subClient, isRedisConnected };
}

/**
 * Check Redis health for Kubernetes Readiness probe (/ready)
 */
export async function checkRedisHealth(): Promise<boolean> {
  if (!config.redisUrl) {
    return true; // Not configured, dev fallback considered alive
  }
  if (!pubClient || !isRedisConnected) {
    return false;
  }
  try {
    const reply = await pubClient.ping();
    return reply === 'PONG';
  } catch (err) {
    return false;
  }
}

/**
 * Mark a user as online in Redis (ephemeral state with TTL)
 */
export async function setUserPresenceOnline(userId: string): Promise<void> {
  if (pubClient && isRedisConnected) {
    try {
      // Store in a Redis SET of online users, and set a key with TTL of 60 seconds
      await pubClient.sadd('minichat:online_users', userId);
      await pubClient.set(`minichat:presence:${userId}`, 'online', 'EX', 120);
      // Publish presence change event to all backend replicas
      await pubClient.publish('minichat:presence', JSON.stringify({ userId, status: 'online' }));
    } catch (err) {
      console.error('[Redis Presence] Error setting online status:', err);
    }
  } else {
    memoryPresence.add(userId);
    localBus.emit('presence', { userId, status: 'online' });
  }
}

/**
 * Mark a user as offline in Redis
 */
export async function setUserPresenceOffline(userId: string): Promise<void> {
  if (pubClient && isRedisConnected) {
    try {
      await pubClient.srem('minichat:online_users', userId);
      await pubClient.del(`minichat:presence:${userId}`);
      await pubClient.publish('minichat:presence', JSON.stringify({ userId, status: 'offline' }));
    } catch (err) {
      console.error('[Redis Presence] Error setting offline status:', err);
    }
  } else {
    memoryPresence.delete(userId);
    localBus.emit('presence', { userId, status: 'offline' });
  }
}

/**
 * Check whether a user is currently online
 */
export async function isUserOnline(userId: string): Promise<boolean> {
  if (pubClient && isRedisConnected) {
    try {
      const exists = await pubClient.sismember('minichat:online_users', userId);
      return exists === 1;
    } catch (err) {
      return false;
    }
  }
  return memoryPresence.has(userId);
}

/**
 * Batch get online user statuses
 */
export async function getOnlineUsers(userIds: string[]): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {};
  if (pubClient && isRedisConnected && userIds.length > 0) {
    try {
      const pipeline = pubClient.pipeline();
      for (const id of userIds) {
        pipeline.sismember('minichat:online_users', id);
      }
      const responses = await pipeline.exec();
      if (responses) {
        responses.forEach(([err, isMember]: [any, any], index: number) => {
          result[userIds[index]] = !err && isMember === 1;
        });
        return result;
      }
    } catch (err) {
      console.error('[Redis] Failed to batch get online users:', err);
    }
  }

  // Fallback
  for (const id of userIds) {
    result[id] = memoryPresence.has(id);
  }
  return result;
}

/**
 * Subscribe to presence events across backend instances
 */
export function onPresenceChange(callback: (data: { userId: string; status: 'online' | 'offline' }) => void): void {
  if (subClient && isRedisConnected) {
    subClient.subscribe('minichat:presence', (err: any) => {
      if (err) console.error('[Redis] Failed to subscribe to minichat:presence channel:', err);
    });
    subClient.on('message', (channel: string, message: string) => {
      if (channel === 'minichat:presence') {
        try {
          const parsed = JSON.parse(message);
          callback(parsed);
        } catch (e) {
          // ignore malformed
        }
      }
    });
  } else {
    localBus.on('presence', callback);
  }
}

/**
 * Gracefully disconnect Redis clients on shutdown
 */
export async function closeRedis(): Promise<void> {
  if (pubClient) {
    await pubClient.quit();
  }
  if (subClient) {
    await subClient.quit();
  }
  console.log('[Redis] Redis connections closed.');
}
