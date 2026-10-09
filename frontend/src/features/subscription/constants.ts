import { PricingPlan } from './types';

export const TRIAL_DURATION_DAYS = 30;

export const TRIAL_START_KEY = 'xpharma_trial_start_date';
export const GLOBAL_PHARMACIES_KEY = 'xpharma_global_linked_pharmacies';
export const SUBSCRIPTION_PLAN_KEY = 'xpharma_active_subscription_plan';

export const KASHIER_MID = 'MID-51040-472';
export const KASHIER_PAYMENT_API_KEY = 'c64c4651-40c5-4a07-afc3-81ecdd5ed324';

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
