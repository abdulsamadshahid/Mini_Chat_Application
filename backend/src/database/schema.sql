-- MiniChat PostgreSQL Database Schema
-- Designed for Kubernetes & DevOps Portfolio Project

-- Enable UUID extension if needed (or standard SERIAL/BIGSERIAL/UUID)
-- Using VARCHAR/TEXT IDs or UUIDs for predictable distributed-system portability
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. CHAT ROOMS TABLE
CREATE TABLE IF NOT EXISTS chat_rooms (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name VARCHAR(100) NOT NULL,
    created_by VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_created_by ON chat_rooms(created_by);

-- 3. CHAT ROOM MEMBERS TABLE
-- Max 3 members rule enforced at application & trigger level
CREATE TABLE IF NOT EXISTS chat_room_members (
    room_id VARCHAR(36) NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_room_members_user ON chat_room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_members_room ON chat_room_members(room_id);

-- 4. MESSAGES TABLE
-- PostgreSQL is the sole source of truth for permanent message history
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    room_id VARCHAR(36) NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at ASC);
