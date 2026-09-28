import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import crypto from 'crypto';
import { config } from '../config.js';
import { verifyToken, AuthUser } from '../middleware/auth.js';
import { query } from '../database/db.js';
import {
  initRedis,
  setUserPresenceOnline,
  setUserPresenceOffline,
  onPresenceChange,
} from '../services/redis.js';

interface CustomSocket extends Socket {
  data: {
    user: AuthUser;
  };
}

// Track local active sockets per user on this backend instance
const userSocketCount = new Map<string, number>();

export async function setupWebSocket(httpServer: HttpServer): Promise<SocketIOServer> {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['websocket', 'polling'],
  });

  // 1. Initialize Redis & Redis Adapter for Horizontal Scalability
  const { pubClient, subClient, isConnected } = await initRedis();
  if (isConnected && pubClient && subClient) {
    try {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[Socket.IO] Redis Adapter successfully attached. Ready for multi-replica Kubernetes clustering.');
    } catch (err) {
      console.error('[Socket.IO] Failed to attach Redis adapter:', err);
    }
  } else {
    console.log('[Socket.IO] Running with default in-memory adapter (single-replica dev mode).');
  }

  // 2. Cross-instance presence listener
  onPresenceChange(({ userId, status }) => {
    io.emit('user_presence', { userId, status });
  });

  // 3. Authentication Handshake Middleware
  io.use((socket, next) => {
    try {
      // Extract token from handshake auth or Authorization header
      let token = socket.handshake.auth?.token;
      if (!token && socket.handshake.headers?.authorization) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        } else {
          token = authHeader;
        }
      }

      if (!token) {
        return next(new Error('Authentication failed: Missing JWT token'));
      }

      const decoded = verifyToken(token);
      (socket as CustomSocket).data.user = decoded;
      next();
    } catch (err: any) {
      console.warn('[Socket.IO] Handshake auth rejected:', err.message);
      next(new Error('Authentication failed: Invalid or expired token'));
    }
  });

  // 4. Connection Handler
  io.on('connection', async (rawSocket) => {
    const socket = rawSocket as CustomSocket;
    const user = socket.data.user;

    console.log(`[Socket.IO] Client connected: user "${user.name}" (${user.id}), socket ${socket.id}`);

    // Track active connection count for this user
    const currentCount = (userSocketCount.get(user.id) || 0) + 1;
    userSocketCount.set(user.id, currentCount);

    // Mark online in Redis and announce presence
    await setUserPresenceOnline(user.id);
    io.emit('user_presence', { userId: user.id, status: 'online' });

    // Join user's personal notification room
    socket.join(`user:${user.id}`);

    /**
     * Event: join_room
     * Authenticated check if user is a member of the room before allowing them to subscribe
     */
    socket.on('join_room', async ({ roomId }, callback) => {
      try {
        if (!roomId) {
          if (callback) callback({ error: 'Room ID is required' });
          return;
        }

        // Verify membership in database
        const memberCheck = await query(
          'SELECT room_id FROM chat_room_members WHERE room_id = $1 AND user_id = $2',
          [roomId, user.id]
        );

        if (memberCheck.rowCount === 0) {
          if (callback) callback({ error: 'Forbidden: You are not a member of this chat room' });
          return;
        }

        const roomChannel = `room:${roomId}`;
        socket.join(roomChannel);
        console.log(`[Socket.IO] User ${user.name} joined channel ${roomChannel}`);

        if (callback) callback({ success: true, roomId });
      } catch (err) {
        console.error('[Socket.IO] Error in join_room:', err);
        if (callback) callback({ error: 'Internal server error joining room' });
      }
    });

    /**
     * Event: leave_room
     */
    socket.on('leave_room', ({ roomId }) => {
      if (roomId) {
        socket.leave(`room:${roomId}`);
        console.log(`[Socket.IO] User ${user.name} left channel room:${roomId}`);
      }
    });

    /**
     * Event: send_message
     * 1. Authenticate & validate
     * 2. Persist in PostgreSQL (source of truth)
     * 3. Broadcast across all instances via Redis Adapter
     */
    socket.on('send_message', async ({ roomId, content }, callback) => {
      try {
        if (!roomId || !content || typeof content !== 'string') {
          if (callback) callback({ error: 'Room ID and message content are required' });
          return;
        }

        const trimmedContent = content.trim();
        if (trimmedContent.length === 0) {
          if (callback) callback({ error: 'Message cannot be empty' });
          return;
        }

        if (trimmedContent.length > config.maxMessageLength) {
          if (callback) callback({ error: `Message exceeds maximum length of ${config.maxMessageLength} characters` });
          return;
        }

        // Verify sender is a member of the room
        const membership = await query(
          'SELECT room_id FROM chat_room_members WHERE room_id = $1 AND user_id = $2',
          [roomId, user.id]
        );

        if (membership.rowCount === 0) {
          if (callback) callback({ error: 'Unauthorized: You are not a member of this room' });
          return;
        }

        const messageId = crypto.randomUUID();

        // 1. Store permanently in PostgreSQL
        const insertResult = await query(
          `INSERT INTO messages (id, room_id, user_id, content, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [messageId, roomId, user.id, trimmedContent]
        );

        const savedMessage = {
          id: messageId,
          room_id: roomId,
          user_id: user.id,
          content: trimmedContent,
          created_at: new Date().toISOString(),
          user_name: user.name,
          user_email: user.email,
        };

        // 2. Broadcast to room channel (Redis adapter delivers to all backend replicas!)
        io.to(`room:${roomId}`).emit('new_message', savedMessage);

        if (callback) {
          callback({ success: true, message: savedMessage });
        }
      } catch (err: any) {
        console.error('[Socket.IO] Error in send_message:', err);
        if (callback) callback({ error: 'Failed to process and save message' });
      }
    });

    /**
     * Event: typing
     */
    socket.on('typing', ({ roomId, isTyping }) => {
      if (roomId) {
        socket.to(`room:${roomId}`).emit('user_typing', {
          roomId,
          userId: user.id,
          userName: user.name,
          isTyping: !!isTyping,
        });
      }
    });

    /**
     * Event: disconnect
     */
    socket.on('disconnect', async (reason) => {
      console.log(`[Socket.IO] Socket ${socket.id} disconnected (${reason})`);
      const count = (userSocketCount.get(user.id) || 1) - 1;

      if (count <= 0) {
        userSocketCount.delete(user.id);
        await setUserPresenceOffline(user.id);
        io.emit('user_presence', { userId: user.id, status: 'offline' });
      } else {
        userSocketCount.set(user.id, count);
      }
    });
  });

  return io;
}
