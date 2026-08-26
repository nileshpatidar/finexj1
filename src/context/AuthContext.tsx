import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { api, setAuthToken } from '../services/api';

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
  switchDemoAccount: (accountType: 'demo' | 'newuser' | 'admin') => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('usdt_auth_token'));
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

  const refreshUser = async () => {
    const savedToken = localStorage.getItem('usdt_auth_token');
    if (!savedToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await api.getMe();
      setUser(res.user);
    } catch (err) {
      console.warn('Could not refresh session:', err);
      // If unauthorized, clear token
      if (!isOffline && (err as Error).message?.includes('expired')) {
        setAuthToken(null);
        setToken(null);
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial auto-login to demo user if no token present for seamless preview experience
    const initializeAuth = async () => {
      const savedToken = localStorage.getItem('usdt_auth_token');
      if (savedToken) {
        await refreshUser();
      } else {
        // Auto-login to standard demo user for immediate working demo
        try {
          const res = await api.login({ email: 'demo@usdtfund.com', password: 'UserPass123!' });
          if (res.token && res.user) {
            setAuthToken(res.token);
            setToken(res.token);
            setUser(res.user);
          }
        } catch {
          // If server not yet running or offline
        } finally {
          setIsLoading(false);
        }
      }
    };

    initializeAuth();
  }, []);

  const login = async (email: string, pass: string, code?: string) => {
    const res = await api.login({ email, password: pass, twoFactorCode: code });
    if (res.require2FA) {
      return res;
    }
    if (res.token && res.user) {
      setAuthToken(res.token);
      setToken(res.token);
      setUser(res.user);
    }
    return res;
  };

  const register = async (data: any) => {
    const res = await api.register(data);
    if (res.token && res.user) {
      setAuthToken(res.token);
      setToken(res.token);
      setUser(res.user);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // Ignore
    }
    setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  const logoutAll = async () => {
    try {
      await api.logoutAll();
    } catch {
      // Ignore
    }
    setAuthToken(null);
    setToken(null);
    setUser(null);
  };

  const switchDemoAccount = async (accountType: 'demo' | 'newuser' | 'admin') => {
    setIsLoading(true);
    let email = 'demo@usdtfund.com';
    let pass = 'UserPass123!';

    if (accountType === 'newuser') {
      email = 'newuser@usdtfund.com';
      pass = 'UserPass123!';
    } else if (accountType === 'admin') {
      email = 'admin@usdtfund.com';
      pass = 'AdminPass123!';
    }

    try {
      const res = await api.login({ email, password: pass });
      if (res.token && res.user) {
        setAuthToken(res.token);
        setToken(res.token);
        setUser(res.user);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isOffline,
        login,
        register,
        logout,
        logoutAll,
        refreshUser,
        switchDemoAccount,
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
