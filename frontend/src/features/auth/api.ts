import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { resilientFetch } from '@/utils/resilientFetch';
import {
  API_BASE_URL,
  GOOGLE_WEB_CLIENT_ID,
  TOKEN_KEY,
  USER_KEY,
  HARDWARE_DEVICE_ID_KEY,
} from './constants';
import { getUniqueDeviceId, isExpoGo } from './device';
import { AuthResponse, DeviceCheckResult, UserProfile, SendOtpResponse } from './types';

let GoogleSignin: any = null;
let statusCodes: any = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
};

if (!isExpoGo && Platform.OS !== 'web') {
  try {
    const gModule = require('@react-native-google-signin/google-signin');
    GoogleSignin = gModule.GoogleSignin;
    statusCodes = gModule.statusCodes || statusCodes;
  } catch (err) {
    console.warn('Native RNGoogleSignin not available in this binary.');
  }
}

export function initGoogleSignIn() {
  if (GoogleSignin && Platform.OS !== 'web') {
    try {
      GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        offlineAccess: false,
        scopes: ['profile', 'email'],
      });
    } catch (e) {
      console.warn('Failed to configure GoogleSignin:', e);
    }
  }
}

export async function signInWithGoogle(): Promise<AuthResponse> {
  const { deviceId, deviceName } = await getUniqueDeviceId();

  if (GoogleSignin) {
    try {
      initGoogleSignIn();

      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }

      const response = await GoogleSignin.signIn();
      const idToken = response.data?.idToken ?? (response as any).idToken;

      if (!idToken) {
        return { success: false, error: 'لم يتم استلام رمز التحقق من Google' };
      }

      const resData = await resilientFetch<any>(`${API_BASE_URL}/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_token: idToken,
          device_id: deviceId,
          device_name: deviceName,
        }),
        timeoutMs: 10000,
        retries: 1,
        serviceName: 'auth-google',
      });

      if (resData.code === 'DEVICE_MISMATCH') {
        return {
          success: false,
          code: 'DEVICE_MISMATCH',
          error: resData.error || 'نأسف لقد تم تسجيل الدخول بواسطة جوجل بجهاز آخر. يرجى تسجيل الخروج ثم تسجيل الدخول مرة أخرى.',
          registeredDevice: resData.registered_device || 'هاتف آخر مسجل مسبقاً',
          currentDevice: deviceName,
        };
      }

      if (resData.requires_phone) {
        return {
          success: true,
          requires_phone: true,
          verification_ticket: resData.verification_ticket,
          message: resData.message,
        };
      }

      if (resData.requires_otp) {
        return {
          success: true,
          requires_otp: true,
          phone_masked: resData.phone_masked,
          verification_ticket: resData.verification_ticket,
          message: resData.message,
        };
      }

      if (!resData.success) {
        return {
          success: false,
          error: resData.error || 'فشل التحقق من الحساب مع خادم المنصة',
        };
      }

      const profile = resData.profile || {};
      const user: UserProfile = {
        id: resData.user?.id || profile.sub || 'user',
        name: profile.name || response.data?.user?.name || 'مستخدم',
        email: profile.email || response.data?.user?.email || '',
        photo: profile.picture || response.data?.user?.photo || undefined,
        role: resData.role || 'client',
        provider: 'google',
        deviceId: resData.device_id || deviceId,
        trialDaysLeft: typeof resData.trial_days_left === 'number' ? resData.trial_days_left : 7,
        isTrialExpired: !!resData.is_trial_expired,
        subscriptionPlan: resData.subscription_plan || 0,
      };

      if (resData.token) {
        await SecureStore.setItemAsync(TOKEN_KEY, resData.token);
        await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      }

      return {
        success: true,
        token: resData.token,
        user,
        trialDaysLeft: user.trialDaysLeft,
        isTrialExpired: user.isTrialExpired,
        subscriptionPlan: user.subscriptionPlan,
      };
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return { success: false, error: 'تم إلغاء عملية تسجيل الدخول' };
      } else if (error.code === statusCodes.IN_PROGRESS) {
        return { success: false, error: 'عملية تسجيل الدخول جارية بالفعل...' };
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { success: false, error: 'خدمات Google Play غير متوفرة أو غير محدثة' };
      }
      return {
        success: false,
        error: error.message || 'حدث خطأ أثناء تسجيل الدخول بواسطة Google',
      };
    }
  }

  return signInExpoGoFallback();
}

export async function signInExpoGoFallback(): Promise<AuthResponse> {
  const { deviceId } = await getUniqueDeviceId();
  const user: UserProfile = {
    id: 'pharmacist_expo_go_test',
    name: 'صيدلي XPharma (معاينة)',
    email: 'pharmacist@xpharma.cloud',
    role: 'pharmacist',
    provider: 'google',
    deviceId,
    trialDaysLeft: 7,
    isTrialExpired: false,
    subscriptionPlan: 0,
  };
  const token = `expo_go_jwt_${Date.now()}`;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  return {
    success: true,
    token,
    user,
    trialDaysLeft: 7,
    isTrialExpired: false,
    subscriptionPlan: 0,
  };
}

export async function signInWithApple(): Promise<AuthResponse> {
  try {
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, error: 'تسجيل الدخول بواسطة Apple غير مدعوم على هذا الجهاز' };
    }

    const { deviceId, deviceName } = await getUniqueDeviceId();

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    const identityToken = credential.identityToken;
    if (!identityToken) {
      return { success: false, error: 'لم يتم استلام رمز الهوية من Apple' };
    }

    const fullName = credential.fullName
      ? `${credential.fullName.givenName || ''} ${credential.fullName.familyName || ''}`.trim()
      : '';

    const resData = await resilientFetch<any>(`${API_BASE_URL}/v1/auth/apple`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity_token: identityToken,
        user_id: credential.user,
        email: credential.email,
        name: fullName,
        device_id: deviceId,
        device_name: deviceName,
      }),
      timeoutMs: 10000,
      retries: 1,
      serviceName: 'auth-apple',
    });

    if (resData.code === 'DEVICE_MISMATCH') {
      return {
        success: false,
        code: 'DEVICE_MISMATCH',
        error: resData.error || 'هذا الحساب مسجل ومفعل بالفعل على هاتف آخر. لا يمكن فتح الحساب على أكثر من جهاز في نفس الوقت.',
        registeredDevice: resData.registered_device || 'هاتف آخر مسجل مسبقاً',
        currentDevice: deviceName,
      };
    }

    if (!resData.success) {
      const user: UserProfile = {
        id: credential.user,
        name: fullName || 'مستخدم Apple',
        email: credential.email || 'apple.user@xpharma.cloud',
        role: 'client',
        provider: 'apple',
        deviceId,
        trialDaysLeft: 7,
        isTrialExpired: false,
        subscriptionPlan: 0,
      };
      const token = resData.token || `apple_mock_${Date.now()}`;
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
      return { success: true, token, user, trialDaysLeft: 7, isTrialExpired: false, subscriptionPlan: 0 };
    }

    const user: UserProfile = {
      id: resData.user?.id || credential.user,
      name: fullName || resData.name || 'مستخدم Apple',
      email: credential.email || resData.email || '',
      role: resData.role || 'client',
      provider: 'apple',
      deviceId: resData.device_id || deviceId,
      trialDaysLeft: typeof resData.trial_days_left === 'number' ? resData.trial_days_left : 7,
      isTrialExpired: !!resData.is_trial_expired,
      subscriptionPlan: resData.subscription_plan || 0,
    };

    if (resData.token) {
      await SecureStore.setItemAsync(TOKEN_KEY, resData.token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    }

    return {
      success: true,
      token: resData.token,
      user,
      trialDaysLeft: user.trialDaysLeft,
      isTrialExpired: user.isTrialExpired,
      subscriptionPlan: user.subscriptionPlan,
    };
  } catch (error: any) {
    if (error.code === 'ERR_REQUEST_CANCELED') {
      return { success: false, error: 'تم إلغاء عملية الدخول بواسطة Apple' };
    }
    return {
      success: false,
      error: error.message || 'حدث خطأ أثناء تسجيل الدخول بواسطة Apple',
    };
  }
}

export async function checkDeviceSession(email: string): Promise<DeviceCheckResult> {
  try {
    if (!email) {
      return { success: true, trialDaysLeft: 7, isTrialExpired: false };
    }
    const { deviceId, deviceName } = await getUniqueDeviceId();
    const data = await resilientFetch<any>(`${API_BASE_URL}/v1/auth/check-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        device_id: deviceId,
        device_name: deviceName,
      }),
      timeoutMs: 6000,
      retries: 2,
      serviceName: 'auth-check-device',
      fallback: { success: true, bound: true, trial_days_left: 7, is_trial_expired: false },
    });

    if (data.code === 'DEVICE_MISMATCH') {
      return {
        success: false,
        isMismatch: true,
        code: 'DEVICE_MISMATCH',
        error: data.error || 'هذا الحساب مسجل ومفعل بالفعل على هاتف آخر.',
        registeredDevice: data.registered_device || 'هاتف آخر مسجل مسبقاً',
        currentDevice: deviceName,
      };
    }

    return {
      success: true,
      bound: data.bound !== false,
      trialDaysLeft: typeof data.trial_days_left === 'number' ? data.trial_days_left : 7,
      isTrialExpired: !!data.is_trial_expired,
      subscriptionPlan: data.subscription_plan || 0,
      currentDevice: deviceName,
    };
  } catch (e: any) {
    return {
      success: false,
      error: e.message || 'تعذر الاتصال بالخادم للتحقق من الجهاز',
    };
  }
}

export async function getSavedSession(): Promise<{ token: string | null; user: UserProfile | null }> {
  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const userStr = await SecureStore.getItemAsync(USER_KEY);
    const user = userStr ? JSON.parse(userStr) : null;
    return { token, user };
  } catch (e) {
    return { token: null, user: null };
  }
}

export async function signOut(): Promise<void> {
  try {
    const userStr = await SecureStore.getItemAsync(USER_KEY);
    if (userStr) {
      const u = JSON.parse(userStr);
      if (u?.email) {
        await resilientFetch<any>(`${API_BASE_URL}/v1/auth/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: u.email }),
          timeoutMs: 4000,
          serviceName: 'auth-logout',
        }).catch(() => {});
      }
    }
  } catch (e) {}

  try {
    if (GoogleSignin && Platform.OS !== 'web') {
      const isSignedIn = await GoogleSignin.hasPreviousSignIn();
      if (isSignedIn) {
        await GoogleSignin.signOut();
      }
    }
  } catch (e) {}

  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  } catch (e) {}
}

export async function clearAllAppData(): Promise<void> {
  try {
    await signOut();
  } catch (e) {}

  const knownKeys = [
    TOKEN_KEY,
    USER_KEY,
    HARDWARE_DEVICE_ID_KEY,
    'xpharma_subscription_plan',
    'xpharma_trial_start',
    'xpharma_global_pharmacies_list',
  ];

  for (const key of knownKeys) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (e) {}
  }
}

export async function sendPhoneOtp(phone: string): Promise<SendOtpResponse> {
  try {
    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      return { success: false, error: 'يرجى إدخال رقم الهاتف' };
    }

    const res = await resilientFetch<SendOtpResponse>(`${API_BASE_URL}/v1/auth/otp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone }),
      timeoutMs: 12000,
      retries: 1,
      serviceName: 'auth-otp-send',
    });

    return res;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'حدث خطأ أثناء محاولة إرسال رمز التحقق',
    };
  }
}

export async function verifyPhoneOtp(phone: string, otp: string): Promise<AuthResponse> {
  try {
    const { deviceId, deviceName } = await getUniqueDeviceId();
    const cleanPhone = phone.trim();
    const cleanOtp = otp.trim();

    if (!cleanPhone || !cleanOtp) {
      return { success: false, error: 'رقم الهاتف ورمز التحقق مطلوبان' };
    }

    const resData = await resilientFetch<any>(`${API_BASE_URL}/v1/auth/otp/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: cleanPhone,
        otp: cleanOtp,
        device_id: deviceId,
        device_name: deviceName,
      }),
      timeoutMs: 12000,
      retries: 1,
      serviceName: 'auth-otp-verify',
    });

    if (resData.code === 'DEVICE_MISMATCH') {
      return {
        success: false,
        code: 'DEVICE_MISMATCH',
        error: resData.error || 'هذا الحساب مسجل ومفعل بالفعل على هاتف آخر.',
        registeredDevice: resData.registered_device || 'هاتف آخر مسجل مسبقاً',
        currentDevice: deviceName,
      };
    }

    if (!resData.success) {
      return {
        success: false,
        error: resData.error || 'رمز التحقق غير صحيح أو منتهي الصلاحية',
      };
    }

    const user: UserProfile = {
      id: resData.user?.id || `phone_${cleanPhone}`,
      name: resData.user?.name || `صيدلي (${cleanPhone})`,
      email: resData.user?.email || `${cleanPhone}@phone.xpharma.cloud`,
      phone: cleanPhone,
      role: resData.role || 'user',
      provider: 'phone',
      deviceId: resData.device_id || deviceId,
      trialDaysLeft: typeof resData.trial_days_left === 'number' ? resData.trial_days_left : 30,
      isTrialExpired: !!resData.is_trial_expired,
      subscriptionPlan: resData.subscription_plan || 1,
    };

    if (resData.token) {
      await SecureStore.setItemAsync(TOKEN_KEY, resData.token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    }

    return {
      success: true,
      token: resData.token,
      user,
      trialDaysLeft: user.trialDaysLeft,
      isTrialExpired: user.isTrialExpired,
      subscriptionPlan: user.subscriptionPlan,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'حدث خطأ أثناء التحقق من رمز OTP',
    };
  }
}

export async function googleSendPhoneOtp(ticket: string, phone: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    return await resilientFetch<any>(`${API_BASE_URL}/v1/auth/google/send-phone-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verification_ticket: ticket, phone: phone.trim() }),
      timeoutMs: 12000,
      serviceName: 'auth-google-send-phone-otp',
    });
  } catch (e: any) {
    return { success: false, error: e.message || 'فشل إرسال رمز التحقق' };
  }
}

export async function googleVerifyPhoneOtp(ticket: string, phone: string, otp: string): Promise<AuthResponse> {
  try {
    const resData = await resilientFetch<any>(`${API_BASE_URL}/v1/auth/google/verify-phone-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verification_ticket: ticket, phone: phone.trim(), otp: otp.trim() }),
      timeoutMs: 12000,
      serviceName: 'auth-google-verify-phone-otp',
    });

    if (!resData.success) {
      return { success: false, error: resData.error || 'رمز التحقق غير صحيح' };
    }

    const { deviceId } = await getUniqueDeviceId();
    const user: UserProfile = {
      id: resData.user?.id || 'user',
      name: resData.user?.name || 'مستخدم',
      email: resData.user?.email || '',
      phone: resData.user?.phone,
      photo: resData.user?.photo,
      role: resData.role || 'client',
      provider: 'google',
      deviceId: resData.device_id || deviceId,
      trialDaysLeft: typeof resData.trial_days_left === 'number' ? resData.trial_days_left : 30,
      isTrialExpired: !!resData.is_trial_expired,
      subscriptionPlan: resData.subscription_plan || 1,
    };

    if (resData.token) {
      await SecureStore.setItemAsync(TOKEN_KEY, resData.token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    }

    return {
      success: true,
      token: resData.token,
      user,
      trialDaysLeft: user.trialDaysLeft,
      isTrialExpired: user.isTrialExpired,
      subscriptionPlan: user.subscriptionPlan,
    };
  } catch (e: any) {
    return { success: false, error: e.message || 'فشل التحقق من الرمز' };
  }
}

export async function googleVerifyOtp(ticket: string, otp: string): Promise<AuthResponse> {
  try {
    const resData = await resilientFetch<any>(`${API_BASE_URL}/v1/auth/google/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verification_ticket: ticket, otp: otp.trim() }),
      timeoutMs: 12000,
      serviceName: 'auth-google-verify-otp',
    });

    if (!resData.success) {
      return { success: false, error: resData.error || 'رمز التحقق غير صحيح' };
    }

    const { deviceId } = await getUniqueDeviceId();
    const user: UserProfile = {
      id: resData.user?.id || 'user',
      name: resData.user?.name || 'مستخدم',
      email: resData.user?.email || '',
      phone: resData.user?.phone,
      photo: resData.user?.photo,
      role: resData.role || 'client',
      provider: 'google',
      deviceId: resData.device_id || deviceId,
      trialDaysLeft: typeof resData.trial_days_left === 'number' ? resData.trial_days_left : 30,
      isTrialExpired: !!resData.is_trial_expired,
      subscriptionPlan: resData.subscription_plan || 1,
    };

    if (resData.token) {
      await SecureStore.setItemAsync(TOKEN_KEY, resData.token);
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    }

    return {
      success: true,
      token: resData.token,
      user,
      trialDaysLeft: user.trialDaysLeft,
      isTrialExpired: user.isTrialExpired,
      subscriptionPlan: user.subscriptionPlan,
    };
  } catch (e: any) {
    return { success: false, error: e.message || 'فشل التحقق من الرمز' };
  }
}

export async function googleResendOtp(ticket: string): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    return await resilientFetch<any>(`${API_BASE_URL}/v1/auth/google/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verification_ticket: ticket }),
      timeoutMs: 12000,
      serviceName: 'auth-google-resend-otp',
    });
  } catch (e: any) {
    return { success: false, error: e.message || 'فشل إعادة إرسال الرمز' };
  }
}


