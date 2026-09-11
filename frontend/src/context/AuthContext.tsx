import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  AuthResponse, 
  getSavedSession, 
  initGoogleSignIn, 
  signInWithApple, 
  signInWithGoogle, 
  signOut, 
  UserProfile 
} from '@/services/auth';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  error: string | null;
  loginWithGoogle: () => Promise<boolean>;
  loginWithApple: () => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initGoogleSignIn();
    loadSession();
  }, []);

  async function loadSession() {
    try {
      setIsLoading(true);
      const session = await getSavedSession();
      if (session.token && session.user) {
        setToken(session.token);
        setUser(session.user);
      }
    } catch (e) {
      console.warn('Error restoring session:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLoginResult(result: AuthResponse): Promise<boolean> {
    if (result.success && result.user && result.token) {
      setUser(result.user);
      setToken(result.token);
      setError(null);
      return true;
    } else {
      setError(result.error || 'فشل تسجيل الدخول');
      return false;
    }
  }

  async function loginWithGoogle(): Promise<boolean> {
    setIsAuthenticating(true);
    setError(null);
    try {
      const res = await signInWithGoogle();
      return await handleLoginResult(res);
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function loginWithApple(): Promise<boolean> {
    setIsAuthenticating(true);
    setError(null);
    try {
      const res = await signInWithApple();
      return await handleLoginResult(res);
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function logout(): Promise<void> {
    setIsLoading(true);
    try {
      await signOut();
      setUser(null);
      setToken(null);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }

  function clearError() {
    setError(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticating,
        error,
        loginWithGoogle,
        loginWithApple,
        logout,
        clearError,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
