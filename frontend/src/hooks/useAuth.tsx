'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/types';
import { auth as authApi } from '@/lib/api';
import { getStoredAuth, setStoredAuth, clearStoredAuth } from '@/lib/auth';
import { disconnectSocket } from '@/lib/socket';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const { token: storedToken, user: storedUser } = getStoredAuth();

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(storedUser);

      // Verify token is still valid
      authApi.me(storedToken)
        .then(({ user }) => {
          setUser(user);
          setStoredAuth(storedToken, user);
        })
        .catch(() => {
          clearStoredAuth();
          setToken(null);
          setUser(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const { user, token } = await authApi.login(email, password);
    setUser(user);
    setToken(token);
    setStoredAuth(token, user);
    router.push('/');
  };

  const register = async (email: string, password: string, name: string) => {
    const { user, token } = await authApi.register(email, password, name);
    setUser(user);
    setToken(token);
    setStoredAuth(token, user);
    router.push('/');
  };

  const logout = () => {
    disconnectSocket();
    clearStoredAuth();
    setUser(null);
    setToken(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
