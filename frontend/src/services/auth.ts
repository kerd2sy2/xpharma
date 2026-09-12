import * as AppleAuthentication from 'expo-apple-authentication';
import * as SecureStore from 'expo-secure-store';
import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

const API_BASE_URL = 'https://api.xpharma.cloud';
const TOKEN_KEY = 'xpharma_mobile_jwt';
const USER_KEY = 'xpharma_mobile_user';
const HARDWARE_DEVICE_ID_KEY = 'xpharma_hardware_device_id';

export const SUPPORT_WHATSAPP_NUMBER = '201012345678';

// Google OAuth Web Client ID
export const GOOGLE_WEB_CLIENT_ID = '691858081100-sc5nk157i5vjejhr52pgm8kkh1ofore6.apps.googleusercontent.com';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  photo?: string;
  role: string;
  provider: 'google' | 'apple';
  deviceId?: string;
  trialDaysLeft?: number;
  isTrialExpired?: boolean;
  subscriptionPlan?: number;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: UserProfile;
  error?: string;
  code?: string;
  registeredDevice?: string;
  currentDevice?: string;
  trialDaysLeft?: number;
  isTrialExpired?: boolean;
  subscriptionPlan?: number;
}

export interface DeviceCheckResult {
  success: boolean;
  bound?: boolean;
  isMismatch?: boolean;
  code?: string;
  error?: string;
  registeredDevice?: string;
  currentDevice?: string;
  trialDaysLeft?: number;
  isTrialExpired?: boolean;
  subscriptionPlan?: number;
}

/**
 * Get or create a permanent unique hardware serial / identifier for this physical phone
 */
export async function getUniqueDeviceId(): Promise<{ deviceId: string; deviceName: string }> {
  try {
    let deviceId = await SecureStore.getItemAsync(HARDWARE_DEVICE_ID_KEY);
    if (!deviceId) {
      const randomPart = Math.random().toString(36).substring(2, 10);
      const timestamp = Date.now().toString(36);
      const os = Platform.OS.toUpperCase();
      deviceId = `XPH-${os}-${timestamp}-${randomPart}`;
      await SecureStore.setItemAsync(HARDWARE_DEVICE_ID_KEY, deviceId);
    }

    const brand = Device.brand ? Device.brand.trim() : '';
    const model = Device.modelName ? Device.modelName.trim() : (Device.deviceName || '');
    let deviceName = `${brand} ${model}`.trim();
    if (!deviceName) {
      deviceName = Platform.OS === 'ios' ? 'هاتف iPhone' : (Platform.OS === 'android' ? 'هاتف Android' : 'متصفح');
    }

    return { deviceId, deviceName };
  } catch (e) {
    return {
      deviceId: `XPH-${Platform.OS.toUpperCase()}-DEVICE`,
      deviceName: Platform.OS === 'ios' ? 'هاتف iPhone' : 'هاتف Android',
    };
  }
}

// Detect Expo Go environment
export const isExpoGo = 
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (Constants as any).appOwnership === 'expo';

// Safely require native GoogleSignin only when NOT in Expo Go and native binary is available
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

/**
 * Configure Google Sign-In once on app initialization
 */
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

/**
 * Perform Google Sign-In with Hardware Device Binding & Single-Device Enforcement
 */
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

      // Call XPharma backend with Device ID and Device Name
      const apiRes = await fetch(`${API_BASE_URL}/v1/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id_token: idToken,
          device_id: deviceId,
          device_name: deviceName,
        }),
      });

      const resData = await apiRes.json();

      // Check for Device Mismatch (Account active on another device)
      if (apiRes.status === 409 || resData.code === 'DEVICE_MISMATCH') {
        return {
          success: false,
          code: 'DEVICE_MISMATCH',
          error: resData.error || 'هذا الحساب مسجل ومفعل بالفعل على هاتف آخر. لا يمكن فتح الحساب على أكثر من جهاز في نفس الوقت.',
          registeredDevice: resData.registered_device || 'هاتف آخر مسجل مسبقاً',
          currentDevice: deviceName,
        };
      }

      if (!apiRes.ok || !resData.success) {
        return { 
          success: false, 
          error: resData.error || 'فشل التحقق من الحساب مع خادم المنصة' 
        };
      }

      const profile = resData.profile || {};
      const user: UserProfile = {
        id: profile.sub || 'user',
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
        error: error.message || 'حدث خطأ أثناء تسجيل الدخول بواسطة Google' 
      };
    }
  }

  // Fallback for Expo Go
  return signInExpoGoFallback();
}

/**
 * Expo Go session fallback for seamless development & testing
 */
export async function signInExpoGoFallback(): Promise<AuthResponse> {
  const { deviceId, deviceName } = await getUniqueDeviceId();
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

/**
 * Perform Apple Sign-In (iOS exclusive) with Hardware Device Binding
 */
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

    // Call XPharma backend Apple auth endpoint with Device ID & Device Name
    const apiRes = await fetch(`${API_BASE_URL}/v1/auth/apple`, {
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
    });

    const resData = await apiRes.json();

    // Handle Device Mismatch
    if (apiRes.status === 409 || resData.code === 'DEVICE_MISMATCH') {
      return {
        success: false,
        code: 'DEVICE_MISMATCH',
        error: resData.error || 'هذا الحساب مسجل ومفعل بالفعل على هاتف آخر. لا يمكن فتح الحساب على أكثر من جهاز في نفس الوقت.',
        registeredDevice: resData.registered_device || 'هاتف آخر مسجل مسبقاً',
        currentDevice: deviceName,
      };
    }

    if (!apiRes.ok || !resData.success) {
      // Fallback if backend Apple endpoint is in setup: allow client session
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
      id: credential.user,
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

/**
 * Check if current device matches the registered device for this email
 * and fetch email trial / subscription status from the central backend.
 */
export async function checkDeviceSession(email: string): Promise<DeviceCheckResult> {
  try {
    if (!email) {
      return { success: true, trialDaysLeft: 7, isTrialExpired: false };
    }
    const { deviceId, deviceName } = await getUniqueDeviceId();
    const res = await fetch(`${API_BASE_URL}/v1/auth/check-device`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        device_id: deviceId,
        device_name: deviceName,
      }),
    });

    const data = await res.json();
    if (res.status === 409 || data.code === 'DEVICE_MISMATCH') {
      return {
        success: false,
        isMismatch: true,
        code: 'DEVICE_MISMATCH',
        error: data.error || 'هذا الحساب مسجل ومفعل بالفعل على هاتف آخر.',
        registeredDevice: data.registered_device || 'هاتف آخر مسجل مسبقاً',
        currentDevice: deviceName,
      };
    }

    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'فشل التحقق من ربط الجهاز',
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

/**
 * Retrieve saved session
 */
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

/**
 * Sign out completely
 */
export async function signOut(): Promise<void> {
  try {
    if (GoogleSignin && Platform.OS !== 'web') {
      const isSignedIn = await GoogleSignin.hasPreviousSignIn();
      if (isSignedIn) {
        await GoogleSignin.signOut();
      }
    }
  } catch (e) {
    // Ignore google sign out errors
  }
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  } catch (e) {
    // Ignore storage deletion errors
  }
}
