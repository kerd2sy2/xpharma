import * as SecureStore from 'expo-secure-store';

const TRIAL_START_KEY = 'xpharma_trial_start_date';
const GLOBAL_PHARMACIES_KEY = 'xpharma_global_linked_pharmacies';
const SUBSCRIPTION_PLAN_KEY = 'xpharma_active_subscription_plan';

export const TRIAL_DURATION_DAYS = 30;

export interface PricingPlan {
  pharmacies: number;
  price: number;
  label: string;
  subtitle: string;
  popular?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    pharmacies: 1,
    price: 100,
    label: 'صيدلية واحدة (1)',
    subtitle: 'ربط صيدلية واحدة في كافة المخازن بلا حدود',
  },
  {
    pharmacies: 2,
    price: 150,
    label: 'صيدليتان (2)',
    subtitle: 'ربط حتى صيدليتين في كل مخزن، مع فتح كافة المخازن بلا حدود',
  },
  {
    pharmacies: 3,
    price: 200,
    label: '3 صيدليات',
    subtitle: 'ربط حتى 3 صيدليات في كل مخزن، مع فتح كافة المخازن بلا حدود',
    popular: true,
  },
  {
    pharmacies: 4,
    price: 250,
    label: '4 صيدليات',
    subtitle: 'ربط حتى 4 صيدليات في كل مخزن، مع فتح كافة المخازن بلا حدود',
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
  allowedPharmacies: number; // 1 during trial, or subscribedPlan
  linkedPharmaciesCount: number;
  uniquePharmacies: Array<{ code: string; name: string; is_suspended?: boolean }>;
  hasOverflow?: boolean;
  requiresSelection?: boolean;
}

export interface UpgradeQuote {
  currentPlan: number;
  currentPlanPrice: number;
  daysRemaining: number;
  unusedCredit: number;
  targetPlan: number;
  targetPlanPrice: number;
  finalAmount: number;
  currency: string;
  isUpgrade: boolean;
  newDurationDays: number;
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
export async function registerGlobalPharmacy(code: string, name: string, email?: string, tenantId?: string): Promise<number> {
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
          body: JSON.stringify({
            code: code.trim(),
            name: name.trim(),
            email: email.trim(),
            tenant_id: tenantId || '',
          }),
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
  let serverAllowedPharmacies = 1;
  let hasOverflow = false;
  let requiresSelection = false;

  // 1. Authoritative check via /v1/subscription/status
  if (userEmail) {
    try {
      const url = `https://api.xpharma.cloud/v1/subscription/status?email=${encodeURIComponent(userEmail.trim().toLowerCase())}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          hasServerSync = true;
          daysRemaining = typeof data.trial_days_left === 'number' ? Math.min(30, Math.max(0, data.trial_days_left)) : 30;
          isTrialExpired = !!data.is_trial_expired;
          subscribedPlan = typeof data.subscription_plan === 'number' ? data.subscription_plan : 0;
          serverAllowedPharmacies = typeof data.allowed_pharmacies === 'number' ? data.allowed_pharmacies : 1;
          hasOverflow = !!data.has_overflow;
          requiresSelection = !!data.requires_selection;

          // If server reports active subscription, store active plan
          if (data.is_subscribed && subscribedPlan > 0) {
            await setActiveSubscriptionPlan(subscribedPlan);
          } else if (!data.is_subscribed) {
            subscribedPlan = 0;
            await setActiveSubscriptionPlan(0);
          }

          // Merge server-linked pharmacies with local cache preserving is_suspended
          if (Array.isArray(data.linked_pharmacies) && data.linked_pharmacies.length > 0) {
            const list: Array<{ code: string; name: string; is_suspended?: boolean }> = [];
            data.linked_pharmacies.forEach((p: any) => {
              if (p.code) {
                list.push({
                  code: p.code,
                  name: p.name || p.code,
                  is_suspended: !!p.is_suspended,
                });
              }
            });
            uniquePharmacies = list;
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
        daysRemaining = Math.min(30, Math.max(0, serverCheck.trialDaysLeft));
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
    daysRemaining = Math.max(0, Math.min(30, Math.ceil(TRIAL_DURATION_DAYS - elapsedDays)));
    isTrialExpired = daysRemaining <= 0 && subscribedPlan === 0;
  }

  // Active status:
  const isSubscribed = hasServerSync
    ? (serverAllowedPharmacies > 0 && !isTrialExpired)
    : (subscribedPlan > 0 || (!isTrialExpired && daysRemaining > 0));

  // If trial or subscription expired: 0 allowed pharmacies ("بعد كده، حتى لو صيدلية واحدة، تبقى الاشتراك 100 جنيه")
  const allowedPharmacies = isTrialExpired
    ? 0
    : isSubscribed
    ? (serverAllowedPharmacies || subscribedPlan || 1)
    : 1;

  return {
    trialStartDate,
    daysRemaining,
    isTrialExpired,
    isSubscribed,
    subscribedPlan,
    allowedPharmacies,
    linkedPharmaciesCount: uniquePharmacies.length,
    uniquePharmacies,
    hasOverflow,
    requiresSelection,
  };
}

/**
 * Check if the user can add another pharmacy / warehouse globally
 * Rule: User can open and link to all warehouses freely as long as trial/subscription is active
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

  if (status.isTrialExpired || (!status.isSubscribed && status.daysRemaining <= 0)) {
    return {
      canAdd: false,
      reason: 'انتهت الفترة التجريبية المجانية (30 يوماً). للاستمرار في استخدام المنصة وربط الصيدليات، يرجى تفعيل اشتراكك (100 ج.م شهرياً لصيدلية واحدة).',
      requiredPlan: 1,
      currentCount: status.linkedPharmaciesCount,
      allowedCount: 0,
      isTrialExpired: true,
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
 * Rule:
 * - If trial/sub is expired: blocked completely, must subscribe (1 pharmacy: 100 EGP).
 * - During 30-day free trial: 1 pharmacy is free ("صيدلية واحدة 30 يوم مجانًا"). Adding a 2nd pharmacy requires upgrading (150 EGP).
 * - On paid plan: up to allowedPharmacies branches allowed.
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

  // Expired trial or inactive subscription:
  if (status.isTrialExpired || (!status.isSubscribed && status.daysRemaining <= 0)) {
    return {
      canAdd: false,
      reason: 'انتهت الفترة التجريبية المجانية (30 يوماً). يرجى تفعيل اشتراكك لمتابعة استخدام المنصة (100 ج.م شهرياً لصيدلية واحدة).',
      requiredPlan: 1,
      isTrialExpired: true,
    };
  }

  // Active paid plan or active trial:
  if (status.isSubscribed) {
    if (warehousePharmaciesCount >= status.allowedPharmacies) {
      const nextPlan = Math.min(5, status.allowedPharmacies + 1);
      return {
        canAdd: false,
        reason: `لقد استنفدت الحد الأقصى لباقة اشتراكك في هذا المخزن (${status.allowedPharmacies} ${status.allowedPharmacies === 1 ? 'صيدلية' : 'صيدليات'}). يرجى ترقية باقتك لإضافة فرع جديد.`,
        requiredPlan: nextPlan,
        isTrialExpired: false,
      };
    }
    return { canAdd: true, isTrialExpired: false };
  }

  // Active Trial (daysRemaining > 0): 1 pharmacy free
  if (warehousePharmaciesCount >= 1) {
    return {
      canAdd: false,
      reason: 'الباقة التجريبية الحالية تشمل صيدلية واحدة فقط مجاناً. لربط صيدليتين أو أكثر في نفس المخزن، يرجى ترقية باقتك (150 ج.م لباقة صيدليتين).',
      requiredPlan: 2,
      isTrialExpired: false,
    };
  }

  return { canAdd: true, isTrialExpired: false };
}

/**
 * Calculate prorated upgrade pricing with credit rollover and 30 fresh days
 */
export async function calculateUpgradeQuote(
  email: string,
  targetPlan: number
): Promise<UpgradeQuote> {
  const cleanEmail = (email || '').trim().toLowerCase();

  // 1. Authoritative Backend Calculation
  if (cleanEmail) {
    try {
      const url = `https://api.xpharma.cloud/v1/subscription/upgrade-quote?email=${encodeURIComponent(cleanEmail)}&target_plan=${targetPlan}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return {
            currentPlan: data.current_plan,
            currentPlanPrice: data.current_plan_price,
            daysRemaining: data.days_remaining,
            unusedCredit: data.unused_credit,
            targetPlan: data.target_plan,
            targetPlanPrice: data.target_plan_price,
            finalAmount: data.final_amount,
            currency: data.currency || 'EGP',
            isUpgrade: !!data.is_upgrade,
            newDurationDays: data.new_duration_days || 30,
          };
        }
      }
    } catch (e) {
      console.warn('Backend upgrade-quote fetch error, using local fallback:', e);
    }
  }

  // 2. Local Fallback Calculation
  const status = await getSubscriptionStatus(cleanEmail);
  const currentPlan = status.isSubscribed ? status.subscribedPlan : 0;
  let currentPlanPrice = 0;
  if (currentPlan === 1) currentPlanPrice = 100;
  else if (currentPlan === 2) currentPlanPrice = 150;
  else if (currentPlan === 3) currentPlanPrice = 200;
  else if (currentPlan === 4) currentPlanPrice = 250;
  else if (currentPlan === 5) currentPlanPrice = 300;

  let resolvedTargetPlan = targetPlan;
  if (currentPlan > 0 && resolvedTargetPlan <= currentPlan) {
    resolvedTargetPlan = Math.min(5, currentPlan + 1);
  }

  let targetPlanPrice = 200;
  if (resolvedTargetPlan === 1) targetPlanPrice = 100;
  else if (resolvedTargetPlan === 2) targetPlanPrice = 150;
  else if (resolvedTargetPlan === 3) targetPlanPrice = 200;
  else if (resolvedTargetPlan === 4) targetPlanPrice = 250;
  else if (resolvedTargetPlan === 5) targetPlanPrice = 300;

  const daysRemaining = Math.max(0, Math.min(30, status.daysRemaining || 0));
  const isUpgrade = currentPlan > 0 && daysRemaining > 0;
  const dailyRate = currentPlanPrice / 30;
  const unusedCredit = isUpgrade ? Math.round(dailyRate * daysRemaining) : 0;
  const rawDiff = targetPlanPrice - unusedCredit;
  let finalAmount = Math.round(rawDiff / 5) * 5;
  if (finalAmount < 50) finalAmount = 50;

  return {
    currentPlan,
    currentPlanPrice,
    daysRemaining,
    unusedCredit,
    targetPlan: resolvedTargetPlan,
    targetPlanPrice,
    finalAmount,
    currency: 'EGP',
    isUpgrade,
    newDurationDays: 30,
  };
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
  customAmount?: number;
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
    
    // Determine price (custom amount for prorated upgrades or default plan price)
    let amount = 200;
    if (params.customAmount && params.customAmount > 0) {
      amount = params.customAmount;
    } else if (plan === 1) amount = 100;
    else if (plan === 2) amount = 150;
    else if (plan === 3) amount = 200;
    else if (plan === 4) amount = 250;
    else if (plan === 5) amount = 300;

    const timestamp = Date.now();
    const emailPrefix = cleanEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'user';
    const orderId = `XPH-SUB-${emailPrefix}-P${plan}-A${Math.round(amount)}-${timestamp}`;
    const currency = 'EGP';

    // 1. First try Backend endpoint (if backend is live)
    try {
      const res = await fetch('https://api.xpharma.cloud/v1/subscription/kashier/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          plan: plan,
          amount: amount,
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

  // 1. Primary: Send to api.xpharma.cloud backend
  try {
    const res = await fetch('https://api.xpharma.cloud/v1/subscription/record-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return true;
    }
  } catch (e) {
    console.warn('Primary backend record-payment failed, trying fallback:', e);
  }

  // 2. Fallback: Send to admin.xpharma.cloud if primary was unreachable
  try {
    const res = await fetch('https://admin.xpharma.cloud/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) success = true;
  } catch (e) {
    console.warn('Failed to record billing in admin portal fallback:', e);
  }

  return success;
}

/**
 * Select which pharmacies should be active when the user has more linked pharmacies than their current plan allows
 */
export async function selectActivePharmacies(
  email: string,
  activeCodes: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('https://api.xpharma.cloud/v1/subscription/select-active-pharmacies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        active_codes: activeCodes,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true };
    }
    return { success: false, error: data.error || 'فشل تفعيل الصيدليات المختارة' };
  } catch (e: any) {
    return { success: false, error: e.message || 'فشل الاتصال بالخادم' };
  }
}


