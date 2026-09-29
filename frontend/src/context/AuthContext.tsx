import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types/index.ts';
import { api } from '../services/api.ts';
import { socketService } from '../services/socket.ts';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(api.getToken());
  const [loading, setLoading] = useState<boolean>(true);

  // Auto-authenticate on initial load if token exists in localStorage
  useEffect(() => {
    async function loadUser() {
      const storedToken = api.getToken();
      if (!storedToken) {
        setLoading(false);
        return;
      }

      try {
        const { user: currentUser } = await api.getCurrentUser();
        setUser(currentUser);
        setToken(storedToken);
        // Connect websocket with valid JWT
        socketService.connect(storedToken);
      } catch (err) {
        console.warn('[AuthContext] Session expired or invalid token:', err);
        api.setToken(null);
        setToken(null);
        setUser(null);
        socketService.disconnect();
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    api.setToken(res.token);
    setToken(res.token);
    setUser(res.user);
    socketService.connect(res.token);
  };

  const register = async (name: string, email: string, password: string) => {
    const res = await api.register(name, email, password);
    api.setToken(res.token);
    setToken(res.token);
    setUser(res.user);
    socketService.connect(res.token);
  };

  const logout = () => {
    api.setToken(null);
    setToken(null);
    setUser(null);
    socketService.disconnect();
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
