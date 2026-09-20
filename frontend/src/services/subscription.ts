import * as SecureStore from 'expo-secure-store';

const TRIAL_START_KEY = 'xpharma_trial_start_date';
const GLOBAL_PHARMACIES_KEY = 'xpharma_global_linked_pharmacies';
const SUBSCRIPTION_PLAN_KEY = 'xpharma_active_subscription_plan';

export const TRIAL_DURATION_DAYS = 7;

export interface PricingPlan {
  pharmacies: number;
  price: number;
  label: string;
  subtitle: string;
  popular?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    pharmacies: 3,
    price: 200,
    label: '3 صيدليات',
    subtitle: 'إدارة 3 فروع مع كافة المخازن (تفعيل فوري)',
    popular: true,
  },
  {
    pharmacies: 2,
    price: 150,
    label: 'صيدليتان (2)',
    subtitle: 'اشتراك شهري بعد انتهاء الـ 7 أيام التجريبية',
  },
  {
    pharmacies: 1,
    price: 100,
    label: 'صيدلية واحدة',
    subtitle: 'اشتراك شهري بعد انتهاء الـ 7 أيام التجريبية',
  },
  {
    pharmacies: 4,
    price: 250,
    label: '4 صيدليات',
    subtitle: 'تغطية شاملة ومتابعة دقيقة لكل فروعك',
  },
  {
    pharmacies: 5,
    price: 300,
    label: '5 صيدليات',
    subtitle: 'أعلى باقة توفير للسلاسل والصيدليات الكبرى',
  },
];

export interface SubscriptionStatus {
  trialStartDate: string;
  daysRemaining: number;
  isTrialExpired: boolean;
  isSubscribed: boolean;
  subscribedPlan: number; // e.g. 1, 2, 3, 4, 5
  allowedPharmacies: number; // 2 during trial, or subscribedPlan
  linkedPharmaciesCount: number;
  uniquePharmacies: Array<{ code: string; name: string }>;
}

/**
 * Get or initialize trial start date
 */
export async function getOrInitTrialStartDate(): Promise<string> {
  try {
    let dateStr = await SecureStore.getItemAsync(TRIAL_START_KEY);
    if (!dateStr) {
      dateStr = new Date().toISOString();
      await SecureStore.setItemAsync(TRIAL_START_KEY, dateStr);
    }
    return dateStr;
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Get the list of globally linked unique pharmacies across all warehouses
 */
export async function getGlobalLinkedPharmacies(): Promise<Array<{ code: string; name: string }>> {
  try {
    const raw = await SecureStore.getItemAsync(GLOBAL_PHARMACIES_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Register a pharmacy globally when verified
 */
/**
 * Register a pharmacy globally when verified
 */
export async function registerGlobalPharmacy(code: string, name: string, email?: string): Promise<number> {
  try {
    const list = await getGlobalLinkedPharmacies();
    const cleanCode = (code || '').trim().toLowerCase();
    const cleanName = (name || '').trim().toLowerCase();

    const exists = list.some(
      (p) =>
        (cleanCode && p.code.trim().toLowerCase() === cleanCode) ||
        (cleanName && p.name.trim().toLowerCase() === cleanName)
    );

    if (!exists && (cleanCode || cleanName)) {
      list.push({ code: code.trim(), name: name.trim() });
      await SecureStore.setItemAsync(GLOBAL_PHARMACIES_KEY, JSON.stringify(list));
    }

    // Also notify central backend to register linkage in public.pharmacies
    if (email && cleanCode) {
      try {
        await fetch('https://api.xpharma.cloud/v1/subscription/register-pharmacy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code.trim(), name: name.trim(), email: email.trim() }),
        });
      } catch (beErr) {
        console.warn('Backend register-pharmacy call error:', beErr);
      }
    }

    // Ensure trial is initialized locally
    await getOrInitTrialStartDate();

    return list.length;
  } catch (e) {
    console.warn('Failed to register global pharmacy:', e);
    return 1;
  }
}

/**
 * Get current subscription plan (0 = trial, 1, 2, 3, 4, 5 = paid plans)
 */
export async function getActiveSubscriptionPlan(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(SUBSCRIPTION_PLAN_KEY);
    if (raw) {
      const val = parseInt(raw, 10);
      if (!isNaN(val) && val > 0) return val;
    }
    return 0; // 0 means on trial
  } catch {
    return 0;
  }
}

/**
 * Save active subscription plan
 */
export async function setActiveSubscriptionPlan(planCount: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(SUBSCRIPTION_PLAN_KEY, planCount.toString());
  } catch (e) {
    console.warn('Failed to save subscription plan:', e);
  }
}

import { checkDeviceSession } from './auth';

/**
 * Get full subscription status
 * Authoritatively synchronized with central backend (https://api.xpharma.cloud/v1/subscription/status)
 */
export async function getSubscriptionStatus(userEmail?: string): Promise<SubscriptionStatus> {
  const trialStartDate = await getOrInitTrialStartDate();
  let subscribedPlan = await getActiveSubscriptionPlan();
  let uniquePharmacies = await getGlobalLinkedPharmacies();

  let daysRemaining = 7;
  let isTrialExpired = false;
  let hasServerSync = false;
  let serverAllowedPharmacies = 2;

  // 1. Authoritative check via /v1/subscription/status
  if (userEmail) {
    try {
      const url = `https://api.xpharma.cloud/v1/subscription/status?email=${encodeURIComponent(userEmail.trim().toLowerCase())}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          hasServerSync = true;
          daysRemaining = typeof data.trial_days_left === 'number' ? data.trial_days_left : 7;
          isTrialExpired = !!data.is_trial_expired;
          subscribedPlan = typeof data.subscription_plan === 'number' ? data.subscription_plan : 0;
          serverAllowedPharmacies = typeof data.allowed_pharmacies === 'number' ? data.allowed_pharmacies : (subscribedPlan > 0 ? subscribedPlan : 2);

          // Update local plan cache
          if (subscribedPlan > 0) {
            await setActiveSubscriptionPlan(subscribedPlan);
          }

          // Merge server-linked pharmacies with local cache
          if (Array.isArray(data.linked_pharmacies) && data.linked_pharmacies.length > 0) {
            const mergedMap = new Map<string, string>();
            uniquePharmacies.forEach((p) => mergedMap.set(p.code.toLowerCase(), p.name));
            data.linked_pharmacies.forEach((p: any) => {
              if (p.code) mergedMap.set(p.code.toLowerCase(), p.name || p.code);
            });
            uniquePharmacies = Array.from(mergedMap.entries()).map(([code, name]) => ({ code, name }));
            await SecureStore.setItemAsync(GLOBAL_PHARMACIES_KEY, JSON.stringify(uniquePharmacies));
          }
        }
      }
    } catch (err) {
      console.warn('Subscription server status sync error:', err);
    }
  }

  // 2. Secondary sync with checkDeviceSession if server status endpoint wasn't reachable
  if (!hasServerSync && userEmail) {
    try {
      const serverCheck = await checkDeviceSession(userEmail);
      if (serverCheck.success && typeof serverCheck.trialDaysLeft === 'number') {
        daysRemaining = serverCheck.trialDaysLeft;
        isTrialExpired = !!serverCheck.isTrialExpired;
        hasServerSync = true;
        if (typeof serverCheck.subscriptionPlan === 'number' && serverCheck.subscriptionPlan > 0) {
          subscribedPlan = serverCheck.subscriptionPlan;
          await setActiveSubscriptionPlan(subscribedPlan);
        }
      }
    } catch (err) {
      console.warn('Device session fallback sync error:', err);
    }
  }

  // 3. Fallback to local time calculation if server was completely unreachable
  if (!hasServerSync) {
    const startMs = new Date(trialStartDate).getTime();
    const nowMs = Date.now();
    const elapsedDays = (nowMs - startMs) / (1000 * 60 * 60 * 24);
    daysRemaining = Math.max(0, Math.ceil(TRIAL_DURATION_DAYS - elapsedDays));
    isTrialExpired = false;
  }

  // Free tier: no trial expiration locking
  isTrialExpired = false;

  const isSubscribed = subscribedPlan > 0;
  // Allowed pharmacies: up to 2 pharmacies free initially, or subscribedPlan count when subscribed
  const allowedPharmacies = isSubscribed ? subscribedPlan : 2;

  return {
    trialStartDate,
    daysRemaining,
    isTrialExpired: false,
    isSubscribed,
    subscribedPlan,
    allowedPharmacies,
    linkedPharmaciesCount: uniquePharmacies.length,
    uniquePharmacies,
  };
}

/**
 * Check if the user can add another pharmacy globally
 */
export async function checkCanAddPharmacy(userEmail?: string): Promise<{
  canAdd: boolean;
  reason?: string;
  requiredPlan?: number;
  currentCount: number;
  allowedCount: number;
  isTrialExpired: boolean;
}> {
  const status = await getSubscriptionStatus(userEmail);

  // If adding another pharmacy will exceed the allowed limit (2 free pharmacies):
  if (status.linkedPharmaciesCount >= status.allowedPharmacies) {
    const nextRequiredPlan = !status.isSubscribed
      ? 3 // 2 pharmacies free initially; adding 3rd requires Plan 3
      : Math.min(5, status.allowedPharmacies + 1);

    return {
      canAdd: false,
      reason:
        !status.isSubscribed
          ? 'النظام يتيح ربط حتى صيدليتين (2) مجاناً. لإضافة 3 صيدليات أو أكثر يرجى الاشتراك في باقة مناسبة.'
          : `لقد استنفدت باقتك الحالية (${status.allowedPharmacies} صيدليات). لإضافة فرع جديد يرجى ترقية الباقة.`,
      requiredPlan: nextRequiredPlan,
      currentCount: status.linkedPharmaciesCount,
      allowedCount: status.allowedPharmacies,
      isTrialExpired: false,
    };
  }

  return {
    canAdd: true,
    currentCount: status.linkedPharmaciesCount,
    allowedCount: status.allowedPharmacies,
    isTrialExpired: false,
  };
}

/**
 * Check if pharmacist can add a pharmacy inside a specific warehouse:
 * Rule: Only 1 pharmacy is allowed free in the SAME warehouse.
 * Adding a 2nd pharmacy in the same warehouse requires an active subscription!
 */
export async function checkCanAddPharmacyInWarehouse(
  warehouseId: string,
  warehousePharmaciesCount: number,
  userEmail?: string
): Promise<{
  canAdd: boolean;
  reason?: string;
  requiredPlan?: number;
  isTrialExpired: boolean;
}> {
  const status = await getSubscriptionStatus(userEmail);

  // If user is already subscribed to a paid plan:
  if (status.isSubscribed) {
    if (status.linkedPharmaciesCount >= status.allowedPharmacies) {
      return {
        canAdd: false,
        reason: `لقد استنفدت الحد الأقصى لباقة اشتراكك الحالية (${status.allowedPharmacies} صيدليات). يرجى ترقية باقتك لإضافة فرع جديد.`,
        requiredPlan: Math.min(5, status.allowedPharmacies + 1),
        isTrialExpired: false,
      };
    }
    return { canAdd: true, isTrialExpired: false };
  }

  // Not subscribed:
  // 1. Check if user is trying to add more than 1 pharmacy in the SAME warehouse:
  if (warehousePharmaciesCount >= 1) {
    return {
      canAdd: false,
      reason: 'إضافة أكثر من صيدلية في نفس المخزن تتطلب الاشتراك في إحدى باقات إكس فارما.',
      requiredPlan: 2,
      isTrialExpired: false,
    };
  }

  // 2. Check if overall user already linked 2 pharmacies across all warehouses:
  if (status.linkedPharmaciesCount >= 2) {
    return {
      canAdd: false,
      reason: 'النظام يتيح ربط حتى صيدليتين (2) مجاناً. لإضافة 3 صيدليات أو أكثر يرجى الاشتراك في باقة مناسبة.',
      requiredPlan: 3,
      isTrialExpired: false,
    };
  }

  return { canAdd: true, isTrialExpired: false };
}

import CryptoJS from 'crypto-js';

const KASHIER_MID = 'MID-51040-472';
const KASHIER_PAYMENT_API_KEY = 'c64c4651-40c5-4a07-afc3-81ecdd5ed324';

/**
 * Initiate an online payment session with Kashier (Cards, Meeza, Wallets)
 */
export async function initiateKashierPayment(params: {
  email: string;
  plan: number;
  userName?: string;
  phone?: string;
}): Promise<{
  success: boolean;
  session_url?: string;
  order_id?: string;
  amount?: number;
  error?: string;
}> {
  try {
    const cleanEmail = (params.email || '').trim().toLowerCase();
    const plan = params.plan || 3;
    
    // Determine price
    let amount = 200;
    if (plan === 1) amount = 100;
    else if (plan === 2) amount = 150;
    else if (plan === 3) amount = 200;
    else if (plan === 4) amount = 250;
    else if (plan === 5) amount = 300;

    const timestamp = Date.now();
    const emailPrefix = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'user';
    const orderId = `XPH-SUB-${emailPrefix}-P${plan}-${timestamp}`;
    const currency = 'EGP';

    // 1. First try Backend endpoint (if backend is live)
    try {
      const res = await fetch('https://api.xpharma.cloud/v1/subscription/kashier/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          plan: plan,
          user_name: params.userName || 'دكتور صيدلي',
          phone: params.phone || '',
        }),
      });

      if (res.ok) {
        const text = await res.text();
        if (text.startsWith('{')) {
          const data = JSON.parse(text);
          if (data.success && data.session_url) {
            return {
              success: true,
              session_url: data.session_url,
              order_id: data.order_id || orderId,
              amount: data.amount || amount,
            };
          }
        }
      }
    } catch {
      // Backend not reached, proceed with direct client-side HMAC signature
    }

    // 2. Direct Kashier Hosted Checkout URL with HMAC-SHA256 signature
    const path = `/?payment=${KASHIER_MID}.${orderId}.${amount}.${currency}`;
    const hash = CryptoJS.HmacSHA256(path, KASHIER_PAYMENT_API_KEY).toString(CryptoJS.enc.Hex);

    const redirectUrl = encodeURIComponent('xpharma://subscription-success');
    const webhookUrl = encodeURIComponent('https://api.xpharma.cloud/v1/subscription/kashier/webhook');

    const checkoutUrl = `https://payments.kashier.io/?merchantId=${KASHIER_MID}&orderId=${orderId}&amount=${amount}&currency=${currency}&hash=${hash}&mode=test&display=ar&serverWebhook=${webhookUrl}&merchantRedirect=${redirectUrl}`;

    return {
      success: true,
      session_url: checkoutUrl,
      order_id: orderId,
      amount: amount,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'فشل تجهيز بوابة الدفع',
    };
  }
}

/**
 * Record a successful subscription payment to both web-admin billing review and central API
 */
export async function recordSubscriptionPayment(payload: {
  user_email: string;
  user_name?: string;
  user_phone?: string;
  plan_type: string | number;
  amount: number;
  payment_method?: string;
  status?: string;
  order_id?: string;
  transaction_id?: string;
  card_brand?: string;
  masked_card?: string;
  receipt_ref?: string;
  notes?: string;
}): Promise<boolean> {
  let success = false;

  // 1. Send to admin.xpharma.cloud for Super Admin billing review
  try {
    const res = await fetch('https://admin.xpharma.cloud/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) success = true;
  } catch (e) {
    console.warn('Failed to record billing in admin portal:', e);
  }

  // 2. Send to api.xpharma.cloud backend
  try {
    const res = await fetch('https://api.xpharma.cloud/v1/subscription/record-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) success = true;
  } catch (e) {
    console.warn('Failed to record billing in API backend:', e);
  }

  return success;
}

