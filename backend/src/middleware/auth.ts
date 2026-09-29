import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function generateToken(payload: AuthUser): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as any,
  });
}

export function verifyToken(token: string): AuthUser {
  return jwt.verify(token, config.jwtSecret) as AuthUser;
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    res.status(401).json({ error: 'Authentication token is required.' });
    return;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    res.status(401).json({ error: 'Malformed authorization header. Format must be: Bearer <token>' });
    return;
  }

  const token = parts[1];

  try {
    const decoded = verifyToken(token);
    req.user = {
      id: decoded.id,
      name: decoded.name,
      email: decoded.email,
    };
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token has expired. Please log in again.' });
      return;
    }
    res.status(403).json({ error: 'Invalid or forged authentication token.' });
  }
}
