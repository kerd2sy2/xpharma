export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  photo?: string;
  role: string;
  provider: 'google' | 'apple' | 'phone' | 'otp';
  deviceId?: string;
  trialDaysLeft?: number;
  isTrialExpired?: boolean;
  subscriptionPlan?: number;
}

export interface SendOtpResponse {
  success: boolean;
  message?: string;
  error?: string;
  phone?: string;
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
  requires_phone?: boolean;
  requires_otp?: boolean;
  verification_ticket?: string;
  phone_masked?: string;
  message?: string;
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
