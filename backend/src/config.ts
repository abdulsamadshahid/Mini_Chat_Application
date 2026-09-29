import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'minichat-super-secure-jwt-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  nodeEnv: process.env.NODE_ENV || 'development',
  maxRoomMembers: 3,
  maxMessageLength: 2000,
};
