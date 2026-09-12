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
    pharmacies: 2,
    price: 150,
    label: 'صيدليتان (2)',
    subtitle: 'إدارة فرعين في نفس الوقت عبر كل المخازن',
    popular: true,
  },
  {
    pharmacies: 3,
    price: 200,
    label: '3 صيدليات',
    subtitle: 'حل متكامل لإدارة 3 صيدليات شقيقة',
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
  {
    pharmacies: 1,
    price: 100,
    label: 'صيدلية واحدة',
    subtitle: 'اشتراك شهري بعد انتهاء الـ 7 أيام التجريبية',
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
export async function registerGlobalPharmacy(code: string, name: string): Promise<number> {
  try {
    const list = await getGlobalLinkedPharmacies();
    // Match by code or name
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

    // Also make sure trial is initialized
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

/**
 * Get full subscription status
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus> {
  const trialStartDate = await getOrInitTrialStartDate();
  const subscribedPlan = await getActiveSubscriptionPlan();
  const uniquePharmacies = await getGlobalLinkedPharmacies();

  const startMs = new Date(trialStartDate).getTime();
  const nowMs = Date.now();
  const elapsedDays = (nowMs - startMs) / (1000 * 60 * 60 * 24);
  const daysRemaining = Math.max(0, Math.ceil(TRIAL_DURATION_DAYS - elapsedDays));
  const isTrialExpired = elapsedDays >= TRIAL_DURATION_DAYS && subscribedPlan === 0;
  const isSubscribed = subscribedPlan > 0;

  // Allowed pharmacies:
  // If subscribed: whatever plan is active (e.g. 2, 3, 4, 5)
  // If on trial: strictly 1 pharmacy
  const allowedPharmacies = isSubscribed ? subscribedPlan : 1;

  return {
    trialStartDate,
    daysRemaining,
    isTrialExpired,
    isSubscribed,
    subscribedPlan,
    allowedPharmacies,
    linkedPharmaciesCount: uniquePharmacies.length,
    uniquePharmacies,
  };
}

/**
 * Check if the user can add another pharmacy
 */
export async function checkCanAddPharmacy(): Promise<{
  canAdd: boolean;
  reason?: string;
  requiredPlan?: number;
  currentCount: number;
  allowedCount: number;
  isTrialExpired: boolean;
}> {
  const status = await getSubscriptionStatus();

  if (status.isTrialExpired) {
    return {
      canAdd: false,
      reason: 'انتهت الفترة التجريبية (7 أيام). يرجى الاشتراك للاستمرار.',
      requiredPlan: Math.max(1, status.linkedPharmaciesCount),
      currentCount: status.linkedPharmaciesCount,
      allowedCount: status.allowedPharmacies,
      isTrialExpired: true,
    };
  }

  // If adding another pharmacy will exceed the allowed limit:
  if (status.linkedPharmaciesCount >= status.allowedPharmacies) {
    const nextRequiredPlan = Math.min(5, Math.max(2, status.linkedPharmaciesCount + 1));
    return {
      canAdd: false,
      reason:
        status.linkedPharmaciesCount === 1 && !status.isSubscribed
          ? 'الفترة التجريبية تتيح صيدلية واحدة فقط على جميع المخازن لمدة 7 أيام. لإضافة صيدلية أخرى يرجى الاشتراك.'
          : `لقد استنفدت باقتك الحالية (${status.allowedPharmacies} صيدلية). لإضافة فرع جديد يرجى ترقية الباقة.`,
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
