import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
import { resilientFetch } from '@/utils/resilientFetch';
import { checkDeviceSession } from '@/features/auth';
import {
  TRIAL_DURATION_DAYS,
  TRIAL_START_KEY,
  GLOBAL_PHARMACIES_KEY,
  SUBSCRIPTION_PLAN_KEY,
  KASHIER_MID,
  KASHIER_PAYMENT_API_KEY,
} from './constants';
import { SubscriptionStatus, UpgradeQuote } from './types';

const API_BASE_URL = 'https://api.xpharma.cloud';

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

export async function registerGlobalPharmacy(
  code: string,
  name: string,
  email?: string,
  tenantId?: string
): Promise<number> {
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

    if (email && cleanCode) {
      resilientFetch(`${API_BASE_URL}/v1/subscription/register-pharmacy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          email: email.trim(),
          tenant_id: tenantId || '',
        }),
        timeoutMs: 4000,
        retries: 1,
        serviceName: 'subscription-register',
      }).catch((beErr) => console.warn('Backend register-pharmacy call error:', beErr));
    }

    await getOrInitTrialStartDate();
    return list.length;
  } catch (e) {
    console.warn('Failed to register global pharmacy:', e);
    return 1;
  }
}

export async function getActiveSubscriptionPlan(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(SUBSCRIPTION_PLAN_KEY);
    if (raw) {
      const val = parseInt(raw, 10);
      if (!isNaN(val) && val > 0) return val;
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function setActiveSubscriptionPlan(planCount: number): Promise<void> {
  try {
    await SecureStore.setItemAsync(SUBSCRIPTION_PLAN_KEY, planCount.toString());
  } catch (e) {
    console.warn('Failed to save subscription plan:', e);
  }
}

export async function getSubscriptionStatus(userEmail?: string): Promise<SubscriptionStatus> {
  const trialStartDate = await getOrInitTrialStartDate();
  const localSubscribedPlan = await getActiveSubscriptionPlan();
  let uniquePharmacies = await getGlobalLinkedPharmacies();

  let daysRemaining = 7;
  let isTrialExpired = false;
  let hasServerSync = false;
  let serverAllowedPharmacies = localSubscribedPlan > 0 ? localSubscribedPlan : 1;
  let hasOverflow = false;
  let requiresSelection = false;
  let subscribedPlan = localSubscribedPlan;

  if (userEmail) {
    try {
      const url = `${API_BASE_URL}/v1/subscription/status?email=${encodeURIComponent(userEmail.trim().toLowerCase())}`;
      const data = await resilientFetch<any>(url, {
        timeoutMs: 5000,
        retries: 2,
        serviceName: 'subscription-status',
      });

      if (data && data.success) {
        hasServerSync = true;
        daysRemaining = typeof data.trial_days_left === 'number' ? Math.min(30, Math.max(0, data.trial_days_left)) : 30;
        isTrialExpired = !!data.is_trial_expired;

        const serverPlan = typeof data.subscription_plan === 'number' ? data.subscription_plan : 0;
        const serverAllowed = typeof data.allowed_pharmacies === 'number' ? data.allowed_pharmacies : 0;

        const effectivePlan = Math.max(localSubscribedPlan, serverPlan);
        subscribedPlan = effectivePlan;

        if (data.is_subscribed || effectivePlan > 0) {
          isTrialExpired = false;
          serverAllowedPharmacies = Math.max(serverAllowed, effectivePlan, 1);
          if (effectivePlan > 0) {
            await setActiveSubscriptionPlan(effectivePlan);
          }
          if (localSubscribedPlan > serverPlan && userEmail) {
            recordSubscriptionPayment({
              user_email: userEmail,
              plan_type: `${localSubscribedPlan} صيدليات`,
              amount: 0,
              payment_method: 'local_sync',
              status: 'active',
              notes: `مزامنة ترقية باقة معتمدة محلياً (${localSubscribedPlan} صيدليات)`,
            }).catch(() => {});
          }
        } else {
          subscribedPlan = 0;
          serverAllowedPharmacies = 0;
        }

        hasOverflow = !!data.has_overflow;
        requiresSelection = !!data.requires_selection;

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
    } catch (err) {
      console.warn('Subscription server status sync error:', err);
    }
  }

  if (!hasServerSync && userEmail) {
    try {
      const serverCheck = await checkDeviceSession(userEmail);
      if (serverCheck.success && typeof serverCheck.trialDaysLeft === 'number') {
        daysRemaining = Math.min(30, Math.max(0, serverCheck.trialDaysLeft));
        isTrialExpired = !!serverCheck.isTrialExpired;
        hasServerSync = true;
        if (typeof serverCheck.subscriptionPlan === 'number' && serverCheck.subscriptionPlan > 0) {
          const effectivePlan = Math.max(localSubscribedPlan, serverCheck.subscriptionPlan);
          subscribedPlan = effectivePlan;
          serverAllowedPharmacies = Math.max(serverAllowedPharmacies, effectivePlan);
          await setActiveSubscriptionPlan(effectivePlan);
        }
      }
    } catch (err) {
      console.warn('Device session fallback sync error:', err);
    }
  }

  if (!hasServerSync) {
    const startMs = new Date(trialStartDate).getTime();
    const nowMs = Date.now();
    const elapsedDays = (nowMs - startMs) / (1000 * 60 * 60 * 24);
    daysRemaining = Math.max(0, Math.min(30, Math.ceil(TRIAL_DURATION_DAYS - elapsedDays)));
    isTrialExpired = daysRemaining <= 0 && subscribedPlan === 0;
  }

  const isSubscribed =
    (hasServerSync && !isTrialExpired && (serverAllowedPharmacies > 0 || subscribedPlan > 0)) ||
    subscribedPlan > 0 ||
    (!isTrialExpired && daysRemaining > 0);

  const allowedPharmacies = isTrialExpired
    ? 0
    : isSubscribed
    ? Math.max(serverAllowedPharmacies, subscribedPlan, 1)
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

  if (status.isTrialExpired || (!status.isSubscribed && status.daysRemaining <= 0)) {
    return {
      canAdd: false,
      reason: 'انتهت الفترة التجريبية المجانية (30 يوماً). يرجى تفعيل اشتراكك لمتابعة استخدام المنصة (100 ج.م شهرياً لصيدلية واحدة).',
      requiredPlan: 1,
      isTrialExpired: true,
    };
  }

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

export async function calculateUpgradeQuote(
  email: string,
  targetPlan: number
): Promise<UpgradeQuote> {
  const cleanEmail = (email || '').trim().toLowerCase();

  if (cleanEmail) {
    try {
      const url = `${API_BASE_URL}/v1/subscription/upgrade-quote?email=${encodeURIComponent(cleanEmail)}&target_plan=${targetPlan}`;
      const data = await resilientFetch<any>(url, {
        timeoutMs: 4000,
        retries: 2,
        serviceName: 'subscription-quote',
      });
      if (data && data.success) {
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
    } catch (e) {
      console.warn('Backend upgrade-quote fetch error, using local fallback:', e);
    }
  }

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

    try {
      const data = await resilientFetch<any>(`${API_BASE_URL}/v1/subscription/kashier/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          plan: plan,
          amount: amount,
          user_name: params.userName || 'دكتور صيدلي',
          phone: params.phone || '',
        }),
        timeoutMs: 6000,
        retries: 1,
        serviceName: 'kashier-initiate',
      });

      if (data && data.success && data.session_url) {
        return {
          success: true,
          session_url: data.session_url,
          order_id: data.order_id || orderId,
          amount: data.amount || amount,
        };
      }
    } catch {}

    const path = `/?payment=${KASHIER_MID}.${orderId}.${amount}.${currency}`;
    const hash = CryptoJS.HmacSHA256(path, KASHIER_PAYMENT_API_KEY).toString(CryptoJS.enc.Hex);

    const redirectUrl = encodeURIComponent(
      `${API_BASE_URL}/v1/subscription/kashier/redirect?email=${encodeURIComponent(cleanEmail)}&plan=${plan}`
    );
    const webhookUrl = encodeURIComponent(`${API_BASE_URL}/v1/subscription/kashier/webhook`);

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
  try {
    const res = await resilientFetch<any>(`${API_BASE_URL}/v1/subscription/record-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 6000,
      retries: 2,
      serviceName: 'subscription-record',
    });
    if (res && res.success !== false) return true;
  } catch (e) {
    console.warn('Primary backend record-payment failed, trying fallback:', e);
  }

  try {
    const fallbackRes = await resilientFetch<any>('https://admin.xpharma.cloud/api/billing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 6000,
      retries: 1,
      serviceName: 'admin-billing-fallback',
    });
    if (fallbackRes) success = true;
  } catch (e) {
    console.warn('Failed to record billing in admin portal fallback:', e);
  }

  return success;
}

export async function selectActivePharmacies(
  email: string,
  activeCodes: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const data = await resilientFetch<any>(`${API_BASE_URL}/v1/subscription/select-active-pharmacies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        active_codes: activeCodes,
      }),
      timeoutMs: 6000,
      retries: 2,
      serviceName: 'subscription-select-pharmacies',
    });

    if (data && data.success) {
      return { success: true };
    }
    return { success: false, error: data?.error || 'فشل تفعيل الصيدليات المختارة' };
  } catch (e: any) {
    return { success: false, error: e.message || 'فشل الاتصال بالخادم' };
  }
}
