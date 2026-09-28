import { Router, Response } from 'express';
import crypto from 'crypto';
import { query } from '../database/db.js';
import { config } from '../config.js';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth.js';
import { getOnlineUsers } from '../services/redis.js';

const router = Router();

// Protect all room endpoints with JWT authentication middleware
router.use(authenticateToken);

/**
 * POST /api/rooms
 * Create a new chat room and add the creator as member #1
 */
router.post('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name } = req.body;
    const userId = req.user!.id;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Room name is required.' });
      return;
    }

    const trimmedName = name.trim().slice(0, 100);
    const roomId = crypto.randomUUID();

    // 1. Insert chat_room
    await query(
      `INSERT INTO chat_rooms (id, name, created_by, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [roomId, trimmedName, userId]
    );

    // 2. Insert creator into chat_room_members
    await query(
      `INSERT INTO chat_room_members (room_id, user_id, joined_at)
       VALUES ($1, $2, NOW())`,
      [roomId, userId]
    );

    res.status(201).json({
      message: 'Room created successfully',
      room: {
        id: roomId,
        name: trimmedName,
        created_by: userId,
        created_at: new Date().toISOString(),
        member_count: 1,
      },
    });
  } catch (err) {
    console.error('[Rooms] Create room error:', err);
    res.status(500).json({ error: 'Failed to create chat room.' });
  }
});

/**
 * GET /api/rooms
 * List all chat rooms the current user is a member of
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const result = await query(
      `SELECT 
        cr.id, 
        cr.name, 
        cr.created_by, 
        cr.created_at,
        COUNT(DISTINCT crm_all.user_id)::int AS member_count,
        (
          SELECT content FROM messages m 
          WHERE m.room_id = cr.id 
          ORDER BY m.created_at DESC LIMIT 1
        ) AS last_message,
        (
          SELECT created_at FROM messages m 
          WHERE m.room_id = cr.id 
          ORDER BY m.created_at DESC LIMIT 1
        ) AS last_message_at
      FROM chat_rooms cr
      INNER JOIN chat_room_members crm ON cr.id = crm.room_id AND crm.user_id = $1
      LEFT JOIN chat_room_members crm_all ON cr.id = crm_all.room_id
      GROUP BY cr.id, cr.name, cr.created_by, cr.created_at
      ORDER BY last_message_at DESC NULLS LAST, cr.created_at DESC`,
      [userId]
    );

    res.status(200).json({
      rooms: result.rows,
    });
  } catch (err) {
    console.error('[Rooms] List rooms error:', err);
    res.status(500).json({ error: 'Failed to retrieve chat rooms.' });
  }
});

/**
 * GET /api/rooms/:id
 * Retrieve room details, members, and real-time online presence status
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.id;
    const userId = req.user!.id;

    // 1. Verify user is member of room
    const membershipCheck = await query(
      'SELECT room_id FROM chat_room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );

    if (membershipCheck.rowCount === 0) {
      res.status(403).json({ error: 'You are not a member of this chat room.' });
      return;
    }

    // 2. Fetch room info
    const roomResult = await query(
      'SELECT id, name, created_by, created_at FROM chat_rooms WHERE id = $1',
      [roomId]
    );

    if (roomResult.rowCount === 0) {
      res.status(404).json({ error: 'Chat room not found.' });
      return;
    }

    // 3. Fetch room members
    const membersResult = await query(
      `SELECT u.id, u.name, u.email, crm.joined_at
       FROM chat_room_members crm
       JOIN users u ON crm.user_id = u.id
       WHERE crm.room_id = $1
       ORDER BY crm.joined_at ASC`,
      [roomId]
    );

    // 4. Enrich with presence from Redis
    const memberIds = membersResult.rows.map((m: any) => m.id);
    const presenceMap = await getOnlineUsers(memberIds);

    const membersWithPresence = membersResult.rows.map((m: any) => ({
      ...m,
      online: !!presenceMap[m.id],
    }));

    res.status(200).json({
      room: {
        ...roomResult.rows[0],
        max_members: config.maxRoomMembers,
        members: membersWithPresence,
      },
    });
  } catch (err) {
    console.error('[Rooms] Get room error:', err);
    res.status(500).json({ error: 'Failed to retrieve room details.' });
  }
});

/**
 * POST /api/rooms/:id/members
 * Add a new user to the room by email.
 * Enforces rule: maximum 3 members per room!
 */
router.post('/:id/members', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.id;
    const requestingUserId = req.user!.id;
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email of user to invite is required.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Verify the requesting user is a member of this room
    const requesterCheck = await query(
      'SELECT room_id FROM chat_room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, requestingUserId]
    );

    if (requesterCheck.rowCount === 0) {
      res.status(403).json({ error: 'Only existing room members can add new participants.' });
      return;
    }

    // 2. Check current member count (Max 3 members rule)
    const countResult = await query(
      'SELECT COUNT(*)::int as count FROM chat_room_members WHERE room_id = $1',
      [roomId]
    );

    const currentCount = parseInt(countResult.rows[0]?.count || '0', 10);
    if (currentCount >= config.maxRoomMembers) {
      res.status(400).json({
        error: `Room capacity reached. A room can contain a maximum of ${config.maxRoomMembers} users.`,
        currentCount,
        maxMembers: config.maxRoomMembers,
      });
      return;
    }

    // 3. Find user to add by email
    const targetUserResult = await query(
      'SELECT id, name, email FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    if (targetUserResult.rowCount === 0) {
      res.status(404).json({ error: 'No user registered with this email address.' });
      return;
    }

    const targetUser = targetUserResult.rows[0];

    // 4. Check if user is already a member
    const existingMember = await query(
      'SELECT room_id FROM chat_room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, targetUser.id]
    );

    if (existingMember.rowCount > 0) {
      res.status(409).json({ error: 'This user is already a member of this chat room.' });
      return;
    }

    // 5. Add user to room members
    await query(
      `INSERT INTO chat_room_members (room_id, user_id, joined_at)
       VALUES ($1, $2, NOW())`,
      [roomId, targetUser.id]
    );

    res.status(201).json({
      message: 'User added to room successfully',
      member: {
        id: targetUser.id,
        name: targetUser.name,
        email: targetUser.email,
        joined_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('[Rooms] Add member error:', err);
    if (err.code === 'ROOM_FULL') {
      res.status(400).json({ error: `Room cannot exceed ${config.maxRoomMembers} members.` });
      return;
    }
    res.status(500).json({ error: 'Failed to add member to room.' });
  }
});

/**
 * GET /api/rooms/:id/messages
 * Retrieve historical messages for a room from PostgreSQL
 */
router.get('/:id/messages', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const roomId = req.params.id;
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string || '50', 10), 100);

    // Verify user belongs to room
    const membershipCheck = await query(
      'SELECT room_id FROM chat_room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );

    if (membershipCheck.rowCount === 0) {
      res.status(403).json({ error: 'You are not authorized to view messages in this room.' });
      return;
    }

    // Fetch messages from PostgreSQL (the single source of truth for message history)
    const result = await query(
      `SELECT 
        m.id, 
        m.room_id, 
        m.user_id, 
        m.content, 
        m.created_at,
        u.name AS user_name,
        u.email AS user_email
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.room_id = $1
       ORDER BY m.created_at ASC
       LIMIT $2`,
      [roomId, limit]
    );

    res.status(200).json({
      messages: result.rows,
    });
  } catch (err) {
    console.error('[Rooms] Get messages error:', err);
    res.status(500).json({ error: 'Failed to load message history.' });
  }
});

export default router;
