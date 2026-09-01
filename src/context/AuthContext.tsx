import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  isOffline: boolean;
  login: (email: string, pass: string, code?: string) => Promise<any>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.getMe();
      setUser(res.user);
    } catch (err) {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = async (email: string, pass: string, code?: string) => {
    const res = await api.login({ email, password: pass, twoFactorCode: code });
    if (res.require2FA) {
      return res;
    }
    if (res.user) {
      setUser(res.user);
    }
    return res;
  };

  const register = async (data: any) => {
    const res = await api.register(data);
    if (res.user) {
      setUser(res.user);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore
    }
    setUser(null);
  };

  const logoutAll = async () => {
    try {
      await api.logoutAll();
    } catch {
      // Ignore
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token: user ? 'cookie_session' : null,
        isLoading,
        isOffline,
        login,
        register,
        logout,
        logoutAll,
        refreshUser,
      }}
    >
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

