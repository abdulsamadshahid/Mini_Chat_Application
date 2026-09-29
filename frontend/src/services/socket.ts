import { io, Socket } from 'socket.io-client';
import { Message } from '../types/index.ts';

class SocketService {
  private socket: Socket | null = null;
  private isConnecting = false;

  connect(token: string): Socket {
    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    const wsUrl = import.meta.env.VITE_WS_URL || window.location.origin;

    this.isConnecting = true;
    this.socket = io(wsUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on('connect', () => {
      this.isConnecting = false;
      console.log('[WebSocket] Connected with ID:', this.socket?.id);
    });

    this.socket.on('connect_error', (err) => {
      this.isConnecting = false;
      console.warn('[WebSocket] Connection error:', err.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WebSocket] Disconnected:', reason);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  // Room actions
  joinRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Socket not connected' });
      }

      this.socket.emit('join_room', { roomId }, (res: any) => {
        if (res && res.error) {
          resolve({ success: false, error: res.error });
        } else {
          resolve({ success: true });
        }
      });
    });
  }

  leaveRoom(roomId: string) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('leave_room', { roomId });
    }
  }

  sendMessage(roomId: string, content: string): Promise<{ success: boolean; message?: Message; error?: string }> {
    return new Promise((resolve) => {
      if (!this.socket || !this.socket.connected) {
        return resolve({ success: false, error: 'Socket connection offline. Please reconnect.' });
      }

      this.socket.emit('send_message', { roomId, content }, (res: any) => {
        if (res && res.error) {
          resolve({ success: false, error: res.error });
        } else {
          resolve({ success: true, message: res.message });
        }
      });
    });
  }

  sendTyping(roomId: string, isTyping: boolean) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('typing', { roomId, isTyping });
    }
  }
}

export const socketService = new SocketService();
