import pg from 'pg';
import { config } from '../config.js';
import crypto from 'crypto';

const { Pool } = pg;

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

let pool: pg.Pool | null = null;
let isPostgresConnected = false;

// Fallback in-memory store for development environment when no external PostgreSQL instance is running
interface MemoryUser {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: Date;
}

interface MemoryRoom {
  id: string;
  name: string;
  created_by: string;
  created_at: Date;
}

interface MemoryRoomMember {
  room_id: string;
  user_id: string;
  joined_at: Date;
}

interface MemoryMessage {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: Date;
}

const memoryStore = {
  users: new Map<string, MemoryUser>(),
  rooms: new Map<string, MemoryRoom>(),
  members: new Map<string, MemoryRoomMember>(), // key: `${roomId}:${userId}`
  messages: new Map<string, MemoryMessage>(),
};

/**
 * Initialize PostgreSQL connection pool and run initial schema migrations.
 */
export async function initDatabase(): Promise<void> {
  if (config.databaseUrl) {
    try {
      pool = new Pool({
        connectionString: config.databaseUrl,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      pool.on('error', (err) => {
        console.error('[PostgreSQL] Unexpected pool error on idle client:', err);
      });

      const client = await pool.connect();
      console.log('[PostgreSQL] Successfully connected to database cluster.');
      isPostgresConnected = true;

      // Run schema initialization
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

        CREATE TABLE IF NOT EXISTS chat_rooms (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          created_by VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_chat_rooms_created_by ON chat_rooms(created_by);

        CREATE TABLE IF NOT EXISTS chat_room_members (
          room_id VARCHAR(36) NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
          user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (room_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_chat_room_members_user ON chat_room_members(user_id);
        CREATE INDEX IF NOT EXISTS idx_chat_room_members_room ON chat_room_members(room_id);

        CREATE TABLE IF NOT EXISTS messages (
          id VARCHAR(36) PRIMARY KEY,
          room_id VARCHAR(36) NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
          user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at ASC);
      `);

      client.release();
      console.log('[PostgreSQL] Schema initialized successfully.');
      return;
    } catch (err: any) {
      console.warn(`[PostgreSQL] Connection failed (${err.message}). Using in-memory fallback for local preview.`);
      isPostgresConnected = false;
      pool = null;
    }
  } else {
    console.log('[Database] No DATABASE_URL set. Running in-memory database mode for development.');
    isPostgresConnected = false;
  }
}

/**
 * Execute a query against PostgreSQL, or fallback store if PG is unavailable.
 */
export async function query<T extends pg.QueryResultRow = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
  if (pool && isPostgresConnected) {
    try {
      const res = await pool.query<T>(text, params);
      return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
    } catch (err) {
      console.error('[PostgreSQL] Query execution error:', err, 'SQL:', text);
      throw err;
    }
  }

  // In-memory fallback executor for common MiniChat queries
  return executeInMemoryQuery<T>(text, params);
}

/**
 * Check DB health for Kubernetes Readiness probe (/ready)
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  if (!config.databaseUrl) {
    // If no DATABASE_URL was configured, in-memory mode is alive
    return true;
  }
  if (!pool || !isPostgresConnected) {
    return false;
  }
  try {
    const res = await pool.query('SELECT 1');
    return res.rowCount !== null && res.rowCount > 0;
  } catch (err) {
    return false;
  }
}

/**
 * Helper to gracefully close the database pool on SIGTERM/SIGINT
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    console.log('[PostgreSQL] Database pool drained and closed.');
  }
}

// In-Memory Query Simulator (Dev fallback)
function executeInMemoryQuery<T = any>(sql: string, params: any[]): QueryResult<T> {
  const normalized = sql.replace(/\s+/g, ' ').trim().toLowerCase();

  // 1. SELECT 1 (Healthcheck)
  if (normalized === 'select 1') {
    return { rows: [{ '?column?': 1 }] as any, rowCount: 1 };
  }

  // 2. INSERT INTO users
  if (normalized.startsWith('insert into users')) {
    const [id, name, email, password_hash] = params;
    // Check email uniqueness
    for (const u of memoryStore.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) {
        const err: any = new Error('duplicate key value violates unique constraint "users_email_key"');
        err.code = '23505';
        throw err;
      }
    }
    const user: MemoryUser = {
      id: id || crypto.randomUUID(),
      name,
      email,
      password_hash,
      created_at: new Date(),
    };
    memoryStore.users.set(user.id, user);
    return { rows: [user] as any, rowCount: 1 };
  }

  // 3. SELECT * FROM users WHERE email = $1
  if (normalized.includes('from users') && normalized.includes('where email =') || normalized.includes('where lower(email) =')) {
    const emailToFind = String(params[0]).toLowerCase();
    for (const u of memoryStore.users.values()) {
      if (u.email.toLowerCase() === emailToFind) {
        return { rows: [u] as any, rowCount: 1 };
      }
    }
    return { rows: [], rowCount: 0 };
  }

  // 4. SELECT * FROM users WHERE id = $1
  if (normalized.includes('from users') && normalized.includes('where id =')) {
    const idToFind = String(params[0]);
    const u = memoryStore.users.get(idToFind);
    return { rows: u ? [u] as any : [], rowCount: u ? 1 : 0 };
  }

  // 5. INSERT INTO chat_rooms
  if (normalized.startsWith('insert into chat_rooms')) {
    const [id, name, created_by] = params;
    const room: MemoryRoom = {
      id: id || crypto.randomUUID(),
      name,
      created_by,
      created_at: new Date(),
    };
    memoryStore.rooms.set(room.id, room);
    return { rows: [room] as any, rowCount: 1 };
  }

  // 6. INSERT INTO chat_room_members
  if (normalized.startsWith('insert into chat_room_members')) {
    const [room_id, user_id] = params;
    const key = `${room_id}:${user_id}`;
    if (memoryStore.members.has(key)) {
      const err: any = new Error('User is already a member of this room');
      err.code = '23505';
      throw err;
    }
    // Check member count
    let count = 0;
    for (const m of memoryStore.members.values()) {
      if (m.room_id === room_id) count++;
    }
    if (count >= config.maxRoomMembers) {
      const err: any = new Error(`Room cannot exceed ${config.maxRoomMembers} members`);
      err.code = 'ROOM_FULL';
      throw err;
    }

    const member: MemoryRoomMember = {
      room_id,
      user_id,
      joined_at: new Date(),
    };
    memoryStore.members.set(key, member);
    return { rows: [member] as any, rowCount: 1 };
  }

  // 7. COUNT members in room
  if (normalized.includes('count(*)') && normalized.includes('from chat_room_members') && normalized.includes('room_id =')) {
    const roomId = params[0];
    let count = 0;
    for (const m of memoryStore.members.values()) {
      if (m.room_id === roomId) count++;
    }
    return { rows: [{ count }] as any, rowCount: 1 };
  }

  // 8. SELECT rooms for a user
  if (normalized.includes('from chat_rooms') && normalized.includes('chat_room_members')) {
    const userId = params[0];
    const userRoomIds = new Set<string>();
    for (const m of memoryStore.members.values()) {
      if (m.user_id === userId) {
        userRoomIds.add(m.room_id);
      }
    }

    const result = [];
    for (const roomId of userRoomIds) {
      const room = memoryStore.rooms.get(roomId);
      if (room) {
        let memberCount = 0;
        for (const m of memoryStore.members.values()) {
          if (m.room_id === roomId) memberCount++;
        }
        // find last message
        let lastMessage: MemoryMessage | null = null;
        for (const msg of memoryStore.messages.values()) {
          if (msg.room_id === roomId) {
            if (!lastMessage || msg.created_at > lastMessage.created_at) {
              lastMessage = msg;
            }
          }
        }

        result.push({
          id: room.id,
          name: room.name,
          created_by: room.created_by,
          created_at: room.created_at,
          member_count: memberCount,
          last_message: lastMessage ? lastMessage.content : null,
          last_message_at: lastMessage ? lastMessage.created_at : null,
        });
      }
    }

    // sort desc by created_at or last_message_at
    result.sort((a, b) => {
      const timeA = new Date(a.last_message_at || a.created_at).getTime();
      const timeB = new Date(b.last_message_at || b.created_at).getTime();
      return timeB - timeA;
    });

    return { rows: result as any, rowCount: result.length };
  }

  // 9. SELECT room details & members
  if (normalized.includes('from chat_rooms') && normalized.includes('where') && normalized.includes('id =')) {
    const roomId = params[0];
    const room = memoryStore.rooms.get(roomId);
    if (!room) return { rows: [], rowCount: 0 };
    return { rows: [room] as any, rowCount: 1 };
  }

  // 10. SELECT members of a room
  if (normalized.includes('from chat_room_members') && normalized.includes('join users') && normalized.includes('where crm.room_id =')) {
    const roomId = params[0];
    const members = [];
    for (const m of memoryStore.members.values()) {
      if (m.room_id === roomId) {
        const u = memoryStore.users.get(m.user_id);
        if (u) {
          members.push({
            id: u.id,
            name: u.name,
            email: u.email,
            joined_at: m.joined_at,
          });
        }
      }
    }
    return { rows: members as any, rowCount: members.length };
  }

  // 11. Check if user is member of room
  if (normalized.includes('from chat_room_members') && normalized.includes('where room_id =') && normalized.includes('user_id =')) {
    const roomId = params[0];
    const userId = params[1];
    const key = `${roomId}:${userId}`;
    const m = memoryStore.members.get(key);
    return { rows: m ? [m] as any : [], rowCount: m ? 1 : 0 };
  }

  // 12. INSERT INTO messages
  if (normalized.startsWith('insert into messages')) {
    const [id, room_id, user_id, content] = params;
    const msg: MemoryMessage = {
      id: id || crypto.randomUUID(),
      room_id,
      user_id,
      content,
      created_at: new Date(),
    };
    memoryStore.messages.set(msg.id, msg);
    const u = memoryStore.users.get(user_id);
    const enriched = {
      ...msg,
      user_name: u?.name || 'Unknown',
      user_email: u?.email || '',
    };
    return { rows: [enriched] as any, rowCount: 1 };
  }

  // 13. SELECT messages for a room
  if (normalized.includes('from messages') && normalized.includes('where m.room_id =')) {
    const roomId = params[0];
    const roomMessages: any[] = [];
    for (const msg of memoryStore.messages.values()) {
      if (msg.room_id === roomId) {
        const u = memoryStore.users.get(msg.user_id);
        roomMessages.push({
          id: msg.id,
          room_id: msg.room_id,
          user_id: msg.user_id,
          content: msg.content,
          created_at: msg.created_at,
          user_name: u?.name || 'Unknown',
          user_email: u?.email || '',
        });
      }
    }
    roomMessages.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return { rows: roomMessages as any, rowCount: roomMessages.length };
  }

  return { rows: [], rowCount: 0 };
}
