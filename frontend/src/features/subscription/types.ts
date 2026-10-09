export interface PricingPlan {
  pharmacies: number;
  price: number;
  label: string;
  subtitle: string;
  popular?: boolean;
}

export interface SubscriptionStatus {
  trialStartDate: string;
  daysRemaining: number;
  isTrialExpired: boolean;
  isSubscribed: boolean;
  subscribedPlan: number;
  allowedPharmacies: number;
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
