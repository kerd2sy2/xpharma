import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  AuthResponse, 
  checkDeviceSession,
  getSavedSession, 
  initGoogleSignIn, 
  signInWithApple, 
  signInWithGoogle, 
  signOut, 
  UserProfile 
} from '@/services/auth';

export interface DeviceMismatchInfo {
  isMismatch: boolean;
  registeredDevice?: string;
  currentDevice?: string;
  email?: string;
  error?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  error: string | null;
  deviceMismatchInfo: DeviceMismatchInfo | null;
  loginWithGoogle: () => Promise<boolean>;
  loginWithApple: () => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  clearDeviceMismatch: () => void;
  refreshDeviceSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceMismatchInfo, setDeviceMismatchInfo] = useState<DeviceMismatchInfo | null>(null);

  useEffect(() => {
    initGoogleSignIn();
    loadSession();
  }, []);

  async function loadSession() {
    try {
      setIsLoading(true);
      const session = await getSavedSession();
      if (session.token && session.user) {
        // Verify that this device is still the bound device for this user email
        if (session.user.email) {
          const checkRes = await checkDeviceSession(session.user.email);
          if (checkRes.isMismatch) {
            setDeviceMismatchInfo({
              isMismatch: true,
              registeredDevice: checkRes.registeredDevice,
              currentDevice: checkRes.currentDevice,
              email: session.user.email,
              error: checkRes.error,
            });
            // Do not authenticate on mismatch
            setUser(null);
            setToken(null);
            setIsLoading(false);
            return;
          }

          // Sync updated trial data if available
          if (typeof checkRes.trialDaysLeft === 'number') {
            session.user.trialDaysLeft = checkRes.trialDaysLeft;
            session.user.isTrialExpired = !!checkRes.isTrialExpired;
            if (checkRes.subscriptionPlan !== undefined) {
              session.user.subscriptionPlan = checkRes.subscriptionPlan;
            }
          }
        }

        setToken(session.token);
        setUser(session.user);
      }
    } catch (e) {
      console.warn('Error restoring session:', e);
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshDeviceSession(): Promise<void> {
    if (user?.email) {
      const checkRes = await checkDeviceSession(user.email);
      if (checkRes.isMismatch) {
        setDeviceMismatchInfo({
          isMismatch: true,
          registeredDevice: checkRes.registeredDevice,
          currentDevice: checkRes.currentDevice,
          email: user.email,
          error: checkRes.error,
        });
      } else {
        setDeviceMismatchInfo(null);
      }
    }
  }

  async function handleLoginResult(result: AuthResponse, requestedEmail?: string): Promise<boolean> {
    if (result.code === 'DEVICE_MISMATCH' || (!result.success && result.registeredDevice)) {
      setDeviceMismatchInfo({
        isMismatch: true,
        registeredDevice: result.registeredDevice,
        currentDevice: result.currentDevice,
        email: requestedEmail || result.user?.email,
        error: result.error,
      });
      setError(result.error || 'هذا الحساب مسجل على هاتف آخر');
      return false;
    }

    if (result.success && result.user && result.token) {
      setUser(result.user);
      setToken(result.token);
      setError(null);
      setDeviceMismatchInfo(null);
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
      setDeviceMismatchInfo(null);
    } finally {
      setIsLoading(false);
    }
  }

  function clearError() {
    setError(null);
  }

  function clearDeviceMismatch() {
    setDeviceMismatchInfo(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticating,
        error,
        deviceMismatchInfo,
        loginWithGoogle,
        loginWithApple,
        logout,
        clearError,
        clearDeviceMismatch,
        refreshDeviceSession,
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

