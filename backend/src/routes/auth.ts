import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../database/db.js';
import { authenticateToken, generateToken, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

// Email regex validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/register
 * Register a new user with bcrypt password hashing
 */
router.post('/register', async (req, res): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    // Input validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'Name is required.' });
      return;
    }

    if (!email || typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      res.status(400).json({ error: 'Valid email address is required.' });
      return;
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters long.' });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();

    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
    if (existing.rowCount > 0) {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }

    // Hash password using bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const userId = crypto.randomUUID();

    // Insert user into PostgreSQL
    await query(
      `INSERT INTO users (id, name, email, password_hash, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, trimmedName, normalizedEmail, passwordHash]
    );

    const userPayload = {
      id: userId,
      name: trimmedName,
      email: normalizedEmail,
    };

    const token = generateToken(userPayload);

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: userPayload,
    });
  } catch (err: any) {
    console.error('[Auth] Registration error:', err);
    if (err.code === '23505') {
      res.status(409).json({ error: 'An account with this email address already exists.' });
      return;
    }
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and issue JWT
 */
router.post('/login', async (req, res): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Query user by email
    const result = await query(
      'SELECT id, name, email, password_hash FROM users WHERE LOWER(email) = $1',
      [normalizedEmail]
    );

    if (result.rowCount === 0) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const user = result.rows[0];

    // Verify password with bcrypt
    const isMatch = await bcrypt.compare(String(password), user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const userPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
    };

    const token = generateToken(userPayload);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: userPayload,
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

/**
 * GET /api/auth/me
 * Retrieve currently authenticated user profile
 */
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const result = await query('SELECT id, name, email, created_at FROM users WHERE id = $1', [userId]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: 'User profile not found.' });
      return;
    }

    res.status(200).json({
      user: result.rows[0],
    });
  } catch (err) {
    console.error('[Auth] Get current user error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
