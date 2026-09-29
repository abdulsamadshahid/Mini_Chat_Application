import { User, Room, Message, HealthStatus } from '../types/index.ts';

// In browser, defaults to relative /api or VITE_API_URL if configured
const BASE_URL = import.meta.env.VITE_API_URL || '';

class ApiService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('minichat_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('minichat_token', token);
    } else {
      localStorage.removeItem('minichat_token');
    }
  }

  getToken(): string | null {
    return this.token || localStorage.getItem('minichat_token');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    let data: any;
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    if (!response.ok) {
      const errorMsg = data.error || data.message || `HTTP ${response.status}: Request failed`;
      throw new Error(errorMsg);
    }

    return data as T;
  }

  // Auth endpoints
  async register(name: string, email: string, password: string): Promise<{ token: string; user: User }> {
    return this.request<{ token: string; user: User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  }

  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    return this.request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async getCurrentUser(): Promise<{ user: User }> {
    return this.request<{ user: User }>('/api/auth/me');
  }

  // Room endpoints
  async getRooms(): Promise<{ rooms: Room[] }> {
    return this.request<{ rooms: Room[] }>('/api/rooms');
  }

  async createRoom(name: string): Promise<{ room: Room }> {
    return this.request<{ room: Room }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async getRoomDetails(roomId: string): Promise<{ room: Room }> {
    return this.request<{ room: Room }>(`/api/rooms/${roomId}`);
  }

  async addMember(roomId: string, email: string): Promise<{ member: any }> {
    return this.request<{ member: any }>(`/api/rooms/${roomId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  async getRoomMessages(roomId: string, limit = 50): Promise<{ messages: Message[] }> {
    return this.request<{ messages: Message[] }>(`/api/rooms/${roomId}/messages?limit=${limit}`);
  }

  // Health probe endpoints for dev & diagnostics
  async getHealth(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/health');
  }

  async getReadiness(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/ready');
  }
}

export const api = new ApiService();
