import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  AuthResponse, 
  checkDeviceSession,
  getSavedSession, 
  googleResendOtp,
  googleSendPhoneOtp,
  googleVerifyOtp,
  googleVerifyPhoneOtp,
  initGoogleSignIn, 
  SendOtpResponse,
  sendPhoneOtp,
  signInWithApple, 
  signInWithGoogle, 
  signOut, 
  UserProfile,
  verifyPhoneOtp,
} from '@/features/auth';

export interface DeviceMismatchInfo {
  isMismatch: boolean;
  registeredDevice?: string;
  currentDevice?: string;
  email?: string;
  error?: string;
}

export interface Google2FAState {
  requiresPhone?: boolean;
  requiresOtp?: boolean;
  verificationTicket: string;
  phoneMasked?: string;
  message?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticating: boolean;
  error: string | null;
  deviceMismatchInfo: DeviceMismatchInfo | null;
  google2FAState: Google2FAState | null;
  loginWithGoogle: () => Promise<boolean>;
  loginWithApple: () => Promise<boolean>;
  requestOtp: (phone: string) => Promise<SendOtpResponse>;
  loginWithPhoneOtp: (phone: string, otp: string) => Promise<boolean>;
  sendGooglePhoneOtp: (phone: string) => Promise<{ success: boolean; error?: string }>;
  verifyGooglePhoneOtp: (phone: string, otp: string) => Promise<boolean>;
  verifyGoogleOtp: (otp: string) => Promise<boolean>;
  resendGoogleOtp: () => Promise<{ success: boolean; error?: string }>;
  cancelGoogle2FA: () => void;
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
  const [google2FAState, setGoogle2FAState] = useState<Google2FAState | null>(null);

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
      setError(result.error || 'نأسف لقد تم تسجيل الدخول بواسطة جوجل بجهاز آخر. يرجى تسجيل الخروج ثم تسجيل الدخول مرة أخرى.');
      return false;
    }

    if (result.success && result.user && result.token) {
      setUser(result.user);
      setToken(result.token);
      setError(null);
      setDeviceMismatchInfo(null);
      setGoogle2FAState(null);
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
      if (res.code === 'DEVICE_MISMATCH' || (!res.success && res.registeredDevice)) {
        setDeviceMismatchInfo({
          isMismatch: true,
          registeredDevice: res.registeredDevice,
          currentDevice: res.currentDevice,
          email: res.user?.email,
          error: res.error,
        });
        setError(res.error || 'نأسف لقد تم تسجيل الدخول بواسطة جوجل بجهاز آخر. يرجى تسجيل الخروج ثم تسجيل الدخول مرة أخرى.');
        return false;
      }

      if (res.requires_phone && res.verification_ticket) {
        setGoogle2FAState({
          requiresPhone: true,
          verificationTicket: res.verification_ticket,
          message: res.message,
        });
        return false;
      }

      if (res.requires_otp && res.verification_ticket) {
        setGoogle2FAState({
          requiresOtp: true,
          verificationTicket: res.verification_ticket,
          phoneMasked: res.phone_masked,
          message: res.message,
        });
        return false;
      }

      return await handleLoginResult(res);
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء تسجيل الدخول بواسطة Google');
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }

  function cancelGoogle2FA() {
    setGoogle2FAState(null);
  }

  async function sendGooglePhoneOtp(phone: string): Promise<{ success: boolean; error?: string }> {
    if (!google2FAState?.verificationTicket) {
      return { success: false, error: 'انتهت صلاحية جلسة التحقق، يرجى إعادة تسجيل الدخول' };
    }
    setIsAuthenticating(true);
    try {
      const res = await googleSendPhoneOtp(google2FAState.verificationTicket, phone);
      if (!res.success) {
        return { success: false, error: res.error || 'فشل إرسال رمز التحقق' };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'فشل إرسال رمز التحقق' };
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function verifyGooglePhoneOtp(phone: string, otp: string): Promise<boolean> {
    if (!google2FAState?.verificationTicket) {
      setError('انتهت صلاحية جلسة التحقق، يرجى إعادة تسجيل الدخول');
      return false;
    }
    setIsAuthenticating(true);
    try {
      const res = await googleVerifyPhoneOtp(google2FAState.verificationTicket, phone, otp);
      if (res.code === 'DEVICE_MISMATCH' || (!res.success && res.registeredDevice)) {
        setDeviceMismatchInfo({
          isMismatch: true,
          registeredDevice: res.registeredDevice,
          currentDevice: res.currentDevice,
          email: res.user?.email,
          error: res.error,
        });
        setError(res.error || 'نأسف لقد تم تسجيل الدخول بواسطة جوجل بجهاز آخر. يرجى تسجيل الخروج ثم تسجيل الدخول مرة أخرى.');
        setGoogle2FAState(null);
        return false;
      }

      if (res.success && res.user && res.token) {
        setUser(res.user);
        setToken(res.token);
        setError(null);
        setDeviceMismatchInfo(null);
        setGoogle2FAState(null);
        return true;
      }
      setError(res.error || 'رمز التحقق غير صحيح أو انتهت صلاحيته');
      return false;
    } catch (e: any) {
      setError(e?.message || 'فشل التحقق من رمز التحقق');
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function verifyGoogleOtp(otp: string): Promise<boolean> {
    if (!google2FAState?.verificationTicket) {
      setError('انتهت صلاحية جلسة التحقق، يرجى إعادة تسجيل الدخول');
      return false;
    }
    setIsAuthenticating(true);
    try {
      const res = await googleVerifyOtp(google2FAState.verificationTicket, otp);
      if (res.code === 'DEVICE_MISMATCH' || (!res.success && res.registeredDevice)) {
        setDeviceMismatchInfo({
          isMismatch: true,
          registeredDevice: res.registeredDevice,
          currentDevice: res.currentDevice,
          email: res.user?.email,
          error: res.error,
        });
        setError(res.error || 'نأسف لقد تم تسجيل الدخول بواسطة جوجل بجهاز آخر. يرجى تسجيل الخروج ثم تسجيل الدخول مرة أخرى.');
        setGoogle2FAState(null);
        return false;
      }

      if (res.success && res.user && res.token) {
        setUser(res.user);
        setToken(res.token);
        setError(null);
        setDeviceMismatchInfo(null);
        setGoogle2FAState(null);
        return true;
      }
      setError(res.error || 'رمز التحقق غير صحيح أو انتهت صلاحيته');
      return false;
    } catch (e: any) {
      setError(e?.message || 'فشل التحقق من رمز التحقق');
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function resendGoogleOtp(): Promise<{ success: boolean; error?: string }> {
    if (!google2FAState?.verificationTicket) {
      return { success: false, error: 'انتهت صلاحية جلسة التحقق' };
    }
    try {
      const res = await googleResendOtp(google2FAState.verificationTicket);
      if (!res.success) {
        return { success: false, error: res.error || 'فشل إعادة إرسال رمز التحقق' };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'فشل إعادة الإرسال' };
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

  async function requestOtp(phone: string): Promise<SendOtpResponse> {
    setIsAuthenticating(true);
    setError(null);
    try {
      const res = await sendPhoneOtp(phone);
      if (!res.success) {
        setError(res.error || 'فشل إرسال رمز التحقق');
      }
      return res;
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function loginWithPhoneOtp(phone: string, otp: string): Promise<boolean> {
    setIsAuthenticating(true);
    setError(null);
    try {
      const res = await verifyPhoneOtp(phone, otp);
      return await handleLoginResult(res, phone);
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
      setGoogle2FAState(null);
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
        google2FAState,
        loginWithGoogle,
        loginWithApple,
        requestOtp,
        loginWithPhoneOtp,
        sendGooglePhoneOtp,
        verifyGooglePhoneOtp,
        verifyGoogleOtp,
        resendGoogleOtp,
        cancelGoogle2FA,
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
