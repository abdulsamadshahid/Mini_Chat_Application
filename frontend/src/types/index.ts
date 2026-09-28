export interface User {
  id: string;
  name: string;
  email: string;
  created_at?: string;
}

export interface RoomMember {
  id: string;
  name: string;
  email: string;
  joined_at?: string;
  online?: boolean;
}

export interface Room {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  member_count: number;
  last_message?: string | null;
  last_message_at?: string | null;
  members?: RoomMember[];
  max_members?: number;
}

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_name: string;
  user_email: string;
}

export interface HealthStatus {
  status: string;
  uptime: number;
  checks?: {
    database: string;
    redis: string;
  };
  timestamp: string;
}
