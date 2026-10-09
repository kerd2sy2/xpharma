import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import {
  PRICING_PLANS,
  PricingPlan,
  getSubscriptionStatus,
  initiateKashierPayment,
  setActiveSubscriptionPlan,
  recordSubscriptionPayment,
} from '@/features/subscription';
import { useAuth } from '@/context/AuthContext';
import SubscriptionNoticeModal, { NoticeType } from '@/components/SubscriptionNoticeModal';

const { width } = Dimensions.get('window');

interface SubscriptionScreenProps {
  reason?: string;
  isTrialExpired?: boolean;
  suggestedPlan?: number;
  onSubscribed?: (planCount: number) => void;
  onBack: () => void;
}

export default function SubscriptionScreen({
  reason,
  isTrialExpired = false,
  suggestedPlan,
  onSubscribed,
  onBack,
}: SubscriptionScreenProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0);
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<number | undefined>(undefined);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<number>(0);
  const [currentDaysRemaining, setCurrentDaysRemaining] = useState<number>(0);
  const [isCurrentlySubscribed, setIsCurrentlySubscribed] = useState<boolean>(false);
  const [isCurrentlyTrialExpired, setIsCurrentlyTrialExpired] = useState<boolean>(isTrialExpired);
  const [loadingCurrentPlan, setLoadingCurrentPlan] = useState<boolean>(true);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [isProcessingKashier, setIsProcessingKashier] = useState(false);
  const [isProcessingDowngrade, setIsProcessingDowngrade] = useState(false);

  // Bottom-sheet notice modal state
  type NoticeModalState = {
    visible: boolean;
    type: NoticeType;
    title: string;
    message: string;
    badgeText?: string;
    primaryButtonText?: string;
    onPrimaryPress?: () => void;
    secondaryButtonText?: string;
    onSecondaryPress?: () => void;
  };
  const [noticeModal, setNoticeModal] = useState<NoticeModalState>({
    visible: false, type: 'info', title: '', message: '',
  });
  const closeNotice = useCallback(() => setNoticeModal((prev) => ({ ...prev, visible: false })), []);
  const showNotice = useCallback((s: Omit<NoticeModalState, 'visible'>) =>
    setNoticeModal({ ...s, visible: true }), []);



  const fetchStatus = async () => {
    try {
      const status = await getSubscriptionStatus(user?.email);
      setIsCurrentlySubscribed(status.isSubscribed);
      setCurrentPlan(status.subscribedPlan || 0);
      setCurrentDaysRemaining(status.daysRemaining);
      setIsCurrentlyTrialExpired(status.isTrialExpired);

      // If user has an active plan, open DIRECTLY on it!
      // Only select suggestedPlan if there's an explicit reason to upgrade beyond current plan.
      if (status.subscribedPlan > 0) {
        if (reason && suggestedPlan && suggestedPlan > status.subscribedPlan) {
          setSelectedPlan(suggestedPlan);
        } else {
          setSelectedPlan(status.subscribedPlan);
        }
      } else if (suggestedPlan) {
        setSelectedPlan(suggestedPlan);
      } else {
        setSelectedPlan(1);
      }
    } catch (err) {
      console.warn('Subscription fetch status error:', err);
    } finally {
      setLoadingCurrentPlan(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [user?.email, suggestedPlan]);

  const activePlanObj = PRICING_PLANS.find((p) => p.pharmacies === selectedPlan) || PRICING_PLANS[0];
  const currentPlanObj = PRICING_PLANS.find((p) => p.pharmacies === currentPlan);

  const isCurrentSelected = isCurrentlySubscribed && selectedPlan !== undefined && selectedPlan === currentPlan;
  const isDowngradeSelected = isCurrentlySubscribed && currentPlan > 0 && selectedPlan !== undefined && selectedPlan < currentPlan;
  const isUpgradeSelected = isCurrentlySubscribed && currentPlan > 0 && selectedPlan !== undefined && selectedPlan > currentPlan;


  // Calculate fair prorated upgrade difference if user upgrades to a higher tier
  const upgradeQuote = useMemo(() => {
    if (!isUpgradeSelected || !currentPlanObj) return null;
    const targetPrice = activePlanObj.price;
    const currentPrice = currentPlanObj.price;
    const days = Math.max(0, Math.min(30, currentDaysRemaining));
    const dailyRate = currentPrice / 30;
    const unusedCredit = Math.round(dailyRate * days);
    const rawDiff = targetPrice - unusedCredit;
    const finalAmount = Math.max(20, Math.round(rawDiff / 5) * 5);
    return {
      targetPrice,
      currentPrice,
      unusedCredit,
      finalAmount,
      daysRemaining: days,
    };
  }, [isUpgradeSelected, currentPlanObj, activePlanObj, currentDaysRemaining]);

  // Handle Android hardware back button
  useEffect(() => {
    const onBackPress = () => {
      onBack();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [onBack]);

  const handlePayWithKashier = async () => {
    if (!user?.email) {
      showNotice({
        type: 'warning',
        title: 'تنبيه',
        message: 'يرجى تسجيل الدخول بحسابك أولاً لإتمام الدفع الإلكتروني.',
        primaryButtonText: 'حسناً',
      });
      return;
    }

    // 1. Lock the target plan and amount AT TIME OF CLICK (immune to state changes)
    const planToPay = selectedPlan ?? 1;
    const targetPlanObj = PRICING_PLANS.find((p) => p.pharmacies === planToPay) || PRICING_PLANS[0];
    const isUpgrading = isCurrentlySubscribed && currentPlan > 0 && planToPay > currentPlan;

    let amountToCharge = targetPlanObj.price;
    let upgradeCredit = 0;
    if (isUpgrading && currentPlanObj) {
      const days = Math.max(0, Math.min(30, currentDaysRemaining));
      const dailyRate = currentPlanObj.price / 30;
      upgradeCredit = Math.round(dailyRate * days);
      const rawDiff = targetPlanObj.price - upgradeCredit;
      amountToCharge = Math.max(20, Math.round(rawDiff / 5) * 5);
    }

    setIsProcessingKashier(true);
    try {
      const res = await initiateKashierPayment({
        email: user.email,
        plan: planToPay,
        customAmount: amountToCharge,
        userName: user.name,
      });

      if (!res.success || !res.session_url) {
        showNotice({
          type: 'error',
          title: 'تعذر فتح بوابة كاشير',
          message: res.error || 'يرجى المحاولة مرة أخرى أو الدفع عبر واتساب.',
          primaryButtonText: 'حسناً',
        });
        setIsProcessingKashier(false);
        return;
      }

      // Open AuthSession that intercepts xpharma:// redirect and closes browser automatically
      const browserResult = await WebBrowser.openAuthSessionAsync(
        res.session_url,
        'xpharma://'
      );

      // Check payment status from redirect URL
      let isPaymentConfirmed = false;
      const returnUrl = browserResult.type === 'success' ? browserResult.url : '';
      if (returnUrl) {
        try {
          const queryIndex = returnUrl.indexOf('?');
          let paymentStatus = '';
          if (queryIndex !== -1) {
            const queryString = returnUrl.substring(queryIndex + 1);
            const searchParams = new URLSearchParams(queryString);
            paymentStatus = (
              searchParams.get('paymentStatus') ||
              searchParams.get('status') ||
              ''
            ).toUpperCase();
          }

          if (
            paymentStatus === 'SUCCESS' ||
            paymentStatus === 'CAPTURED' ||
            paymentStatus === 'PAID' ||
            returnUrl.includes('subscription-success')
          ) {
            isPaymentConfirmed = true;
          }
        } catch (err) {
          console.warn('Error parsing payment status:', err);
        }
      }

      // Fallback: check if backend already received payment via webhook or redirect
      if (!isPaymentConfirmed) {
        try {
          const checkStatus = await getSubscriptionStatus(user.email);
          if (checkStatus.isSubscribed && (checkStatus.subscribedPlan >= planToPay || checkStatus.allowedPharmacies >= planToPay)) {
            isPaymentConfirmed = true;
          }
        } catch (err) {
          console.warn('Fallback status check error:', err);
        }
      }

      if (!isPaymentConfirmed) {
        showNotice({
          type: 'warning',
          title: 'لم تكتمل عملية الدفع',
          message: 'لم يتم استلام تأكيد نجاح العملية من بوابة الدفع. لم يتم خصم أي مبالغ أو تفعيل الاشتراك.',
          primaryButtonText: 'حسناً',
        });
        setIsProcessingKashier(false);
        return;
      }

      // Immediately persist planToPay (LOCKED, immune to selectedPlan changes!)
      await setActiveSubscriptionPlan(planToPay);
      setCurrentPlan(planToPay);
      setSelectedPlan(planToPay);
      setIsCurrentlySubscribed(true);
      setCurrentDaysRemaining(30);
      setIsCurrentlyTrialExpired(false);

      try {
        await recordSubscriptionPayment({
          user_email: user?.email || '',
          user_name: user?.name || 'دكتور صيدلي',
          user_phone: user?.phone || '',
          plan_type: isUpgrading ? `${planToPay} صيدليات (ترقية تناسبية)` : `${planToPay} صيدليات`,
          amount: amountToCharge,
          payment_method: 'kashier',
          status: 'active',
          order_id: res.order_id || '',
          notes: isUpgrading
            ? `ترقية اشتراك تناسبية إلى ${targetPlanObj.label} بقيمة ${amountToCharge} ج.م بدلاً من ${targetPlanObj.price} ج.م (خصم رصيد ${upgradeCredit} ج.م عن ${currentDaysRemaining} يوم)`
            : `اشتراك إلكتروني ناجح بحساب Google (${user?.email || ''}) - باقة ${targetPlanObj.label}`,
        });
      } catch (e) {
        console.warn('Record billing error:', e);
      }

      // Fetch fresh status in background
      try {
        await getSubscriptionStatus(user.email);
      } catch {}

      if (onSubscribed) onSubscribed(planToPay);

      showNotice({
        type: 'success',
        title: 'تم التفعيل بنجاح 🎉',
        badgeText: isUpgrading ? 'تمت الترقية' : 'تم الاشتراك',
        message: isUpgrading
          ? `تمت ترقية باقتك بنجاح إلى (${targetPlanObj.label}). سعة الفروع مفعلة وصلاحيتك الآن 30 يوماً كاملة.`
          : `تم تفعيل اشتراكك بنجاح على (${targetPlanObj.label}). حسابك الآن مفعل ونشط بكافة المزايا.`,
        primaryButtonText: 'متابعة إلى التطبيق',
        onPrimaryPress: () => { closeNotice(); onBack(); },
      });
    } catch (e: any) {
      showNotice({
        type: 'error',
        title: 'خطأ في بوابة الدفع',
        message: 'حدث خطأ أثناء فتح بوابة الدفع: ' + (e.message || 'يرجى المحاولة لاحقاً'),
        primaryButtonText: 'حسناً',
      });
    } finally {
      setIsProcessingKashier(false);
    }
  };

  const handleDowngradePlan = async () => {
    if (selectedPlan === undefined) return;
    setIsProcessingDowngrade(true);
    try {
      await setActiveSubscriptionPlan(selectedPlan);
      setCurrentPlan(selectedPlan);

      try {
        await recordSubscriptionPayment({
          user_email: user?.email || '',
          user_name: user?.name || 'دكتور صيدلي',
          user_phone: user?.phone || '',
          plan_type: `${selectedPlan} صيدليات (تخفيض باقة)`,
          amount: 0,
          payment_method: 'downgrade',
          status: 'active',
          notes: `تخفيض الباقة من ${currentPlan} إلى ${selectedPlan} صيدليات بدون رسوم إضافية`,
        });
      } catch (err) {
        console.warn('Record downgrade error:', err);
      }

      if (onSubscribed) onSubscribed(selectedPlan);

      showNotice({
        type: 'success',
        title: 'تم التخفيض بنجاح 🎉',
        badgeText: 'تم تعديل الباقة',
        message: `تم تحويل باقتك إلى (${activePlanObj.label}). سعة الصيدليات أصبحت ${selectedPlan} صيدليات لكل مخزن، مع بقاء أيامك السابقة (${currentDaysRemaining} يوماً) مفعلة بدون أي رسوم.`,
        primaryButtonText: 'حسناً',
        onPrimaryPress: () => { closeNotice(); onBack(); },
      });
    } catch (e: any) {
      showNotice({
        type: 'error',
        title: 'خطأ',
        message: 'تعذر تنفيذ التخفيض: ' + (e.message || 'يرجى المحاولة لاحقاً'),
        primaryButtonText: 'حسناً',
      });
    } finally {
      setIsProcessingDowngrade(false);
    }
  };

  const handlePrimaryAction = () => {
    if (isCurrentSelected) {
      if (currentDaysRemaining <= 5) {
        handlePayWithKashier();
      } else {
        showNotice({
          type: 'info',
          title: 'باقتك الحالية مفعلة ✓',
          badgeText: `متبقي ${currentDaysRemaining} يوم`,
          message: `أنت مشترك بالفعل في (${activePlanObj.label}).\n\nلا حاجة لسداد الاشتراك مرة أخرى الآن، يمكنك تجديد الاشتراك عند اقتراب موعد انتهائه.`,
          primaryButtonText: 'حسناً',
        });
      }
      return;
    }

    if (isDowngradeSelected) {
      showNotice({
        type: 'confirm',
        title: 'تأكيد تخفيض الباقة',
        message: `أنت مشترك حالياً في (${currentPlanObj?.label || `${currentPlan} صيدليات`}).\n\nهل ترغب في التغيير إلى (${activePlanObj.label})؟\n\nلن يتم خصم أي مبالغ وستستمر فترتك الحالية (${currentDaysRemaining} يوماً) سارية.`,
        primaryButtonText: 'تأكيد التخفيض',
        onPrimaryPress: () => { closeNotice(); handleDowngradePlan(); },
        secondaryButtonText: 'إلغاء',
        onSecondaryPress: closeNotice,
      });
      return;
    }

    // Otherwise: Upgrade or fresh subscription
    handlePayWithKashier();
  };

  const handleCheckAdminActivation = async () => {
    if (!user?.email) {
      showNotice({
        type: 'warning',
        title: 'تنبيه',
        message: 'يرجى تسجيل الدخول بحسابك أولاً للتحقق من حالة الاشتراك.',
        primaryButtonText: 'حسناً',
      });
      return;
    }
    setIsCheckingServer(true);
    try {
      const status = await getSubscriptionStatus(user.email);
      if (status.isSubscribed && status.subscribedPlan > 0) {
        const matchingPlan = PRICING_PLANS.find((p) => p.pharmacies === status.subscribedPlan) || PRICING_PLANS[0];
        setCurrentPlan(status.subscribedPlan);
        setIsCurrentlySubscribed(true);
        setCurrentDaysRemaining(status.daysRemaining);
        setIsCurrentlyTrialExpired(status.isTrialExpired);
        if (onSubscribed) onSubscribed(status.subscribedPlan);
        showNotice({
          type: 'success',
          title: 'حسابك مفعل بنجاح 🎉',
          badgeText: matchingPlan.label,
          message: `تم تأكيد تفعيل باقة (${matchingPlan.label}) بنجاح على خوادم XPharma.`,
          primaryButtonText: 'ممتاز',
        });
      } else {
        showNotice({
          type: 'warning',
          title: 'طلبك قيد المراجعة ⏳',
          message: 'لم يتم تفعيل الباقة حتى الآن.\n\nإذا أتممت الدفع عبر كاشير أو واتساب سيتم التفعيل تلقائياً، يمكنك التحقق مجدداً بعد لحظات.',
          primaryButtonText: 'حسناً',
        });
      }
    } catch (e) {
      showNotice({
        type: 'error',
        title: 'خطأ في الاتصال',
        message: 'تعذر الاتصال بالخادم. يرجى التأكد من اتصال الإنترنت والمحاولة مرة أخرى.',
        primaryButtonText: 'حسناً',
      });
    } finally {
      setIsCheckingServer(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" translucent={false} />

      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backBtnClean}
          onPress={onBack}
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-forward" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.topHeaderTitle} numberOfLines={1}>
          باقات واشتراكات XPharma
        </Text>
        <TouchableOpacity
          style={styles.infoBtn}
          onPress={() => setShowInstructionsModal(true)}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="information-circle-outline" size={24} color="#4F46E5" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Contextual Reason Banner */}
        {Boolean(reason && reason.trim() !== '' && reason.toLowerCase() !== 'general') && (
          <View style={styles.reasonBanner}>
            <Ionicons name="information-circle-outline" size={20} color="#4F46E5" />
            <Text style={styles.reasonBannerText}>{reason}</Text>
          </View>
        )}

        {/* Trial Expired Alert Banner */}
        {isCurrentlyTrialExpired && (
          <View style={styles.expiredBanner}>
            <Ionicons name="alert-circle" size={22} color="#DC2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.expiredBannerTitle}>انتهت الفترة التجريبية المجانية</Text>
              <Text style={styles.expiredBannerSub}>
                يرجى اختيار باقة للاستمرار في ربط الصيدليات ومتابعة الحسابات.
              </Text>
            </View>
          </View>
        )}

        {/* Section Header */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>اختر سعة الفروع المناسبة:</Text>
          <Text style={styles.sectionHeaderSub}>كافة الباقات تتيح فتح كافة المخازن بلا حدود</Text>
        </View>

        {/* Plan Cards List */}
        {loadingCurrentPlan ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#3F0082" />
          </View>
        ) : (
        <View style={styles.plansList}>
          {PRICING_PLANS.map((plan) => {
            const isSelected = selectedPlan === plan.pharmacies;
            const isCurrent = isCurrentlySubscribed && currentPlan === plan.pharmacies;
            return (
              <TouchableOpacity
                key={plan.pharmacies}
                style={[
                  styles.planCardItem,
                  isSelected && styles.planCardItemSelected,
                  isCurrent && styles.planCardItemCurrent,
                ]}
                onPress={() => setSelectedPlan(plan.pharmacies)}
                disabled={isProcessingKashier || isProcessingDowngrade}
                activeOpacity={0.8}
              >
                <View style={styles.planCardRight}>
                  <View
                    style={[
                      styles.radioOuter,
                      isSelected && styles.radioOuterSelected,
                      isCurrent && styles.radioOuterCurrent,
                    ]}
                  >
                    {isSelected && (
                      <View style={[styles.radioInner, isCurrent && styles.radioInnerCurrent]} />
                    )}
                  </View>

                  <View style={styles.planNameCol}>
                    <View style={styles.planTitleRow}>
                      <Text
                        style={[
                          styles.planLabel,
                          isSelected && styles.planLabelSelected,
                          isCurrent && styles.planLabelCurrent,
                        ]}
                      >
                        {plan.label}
                      </Text>
                      {isCurrent && (
                        <View style={styles.currentBadge}>
                          <Ionicons name="checkmark-circle" size={13} color="#059669" />
                          <Text style={styles.currentBadgeText}>
                            باقتك الحالية ({currentDaysRemaining} يوم)
                          </Text>
                        </View>
                      )}
                      {plan.popular && !isCurrent && (
                        <View style={styles.popularBadge}>
                          <Text style={styles.popularBadgeText}>الأكثر طلباً</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.planLimitText}>
                      {plan.pharmacies === 1
                        ? 'صيدلية واحدة في كل مخزن'
                        : `حتى ${plan.pharmacies} صيدليات في كل مخزن`}
                    </Text>
                  </View>
                </View>

                <View style={styles.priceContainer}>
                  <Text
                    style={[
                      styles.priceNumber,
                      isSelected && styles.priceNumberSelected,
                      isCurrent && styles.priceNumberCurrent,
                    ]}
                  >
                    {plan.price}
                  </Text>
                  <Text style={styles.priceCurrency}>ج.م / شهر</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        )}

        {/* Action Buttons & Proration Breakdown */}
        {!loadingCurrentPlan && (
        <View style={styles.actionsContainer}>
          {isUpgradeSelected && upgradeQuote && (
            <View style={styles.prorationCard}>
              <View style={styles.prorationHeader}>
                <Ionicons name="sparkles" size={15} color="#4F46E5" />
                <Text style={styles.prorationTitle}>حساب فرق الترقية التناسبية العادلة</Text>
              </View>
              <View style={styles.prorationRow}>
                <Text style={styles.prorationLabel}>سعر باقة {activePlanObj.label}:</Text>
                <Text style={styles.prorationValue}>{upgradeQuote.targetPrice} ج.م</Text>
              </View>
              <View style={styles.prorationRow}>
                <Text style={styles.prorationLabel}>
                  خصم رصيدك الحالي ({upgradeQuote.daysRemaining} يوم متبقي):
                </Text>
                <Text style={styles.prorationCredit}>- {upgradeQuote.unusedCredit} ج.م</Text>
              </View>
              <View style={styles.prorationDivider} />
              <View style={styles.prorationRow}>
                <Text style={styles.prorationTotalLabel}>المبلغ المطلوب سداده فقط:</Text>
                <Text style={styles.prorationTotalValue}>{upgradeQuote.finalAmount} ج.م</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              isCurrentSelected && currentDaysRemaining > 5 && styles.currentPlanBtn,
              isDowngradeSelected && styles.downgradeBtn,
            ]}
            onPress={handlePrimaryAction}
            disabled={isProcessingKashier || isProcessingDowngrade}
            activeOpacity={0.85}
          >
            {isProcessingKashier || isProcessingDowngrade ? (
              <ActivityIndicator
                size="small"
                color={
                  isDowngradeSelected
                    ? '#B45309'
                    : isCurrentSelected && currentDaysRemaining > 5
                    ? '#059669'
                    : '#FFFFFF'
                }
              />
            ) : isCurrentSelected ? (
              <Ionicons
                name={currentDaysRemaining <= 5 ? 'refresh-outline' : 'checkmark-circle'}
                size={20}
                color={currentDaysRemaining <= 5 ? '#FFFFFF' : '#059669'}
              />
            ) : isDowngradeSelected ? (
              <Ionicons name="arrow-down-circle-outline" size={20} color="#B45309" />
            ) : (
              <Ionicons name="card-outline" size={20} color="#FFFFFF" />
            )}

            <Text
              style={[
                styles.primaryBtnText,
                isCurrentSelected && currentDaysRemaining > 5 && styles.currentPlanBtnText,
                isDowngradeSelected && styles.downgradeBtnText,
              ]}
            >
              {isProcessingKashier
                ? 'جاري تجهيز بوابة الدفع...'
                : isProcessingDowngrade
                ? 'جاري تعديل الباقة...'
                : isCurrentSelected
                ? currentDaysRemaining <= 5
                  ? `تجديد باقتك الحالية — ${activePlanObj.price} ج.م`
                  : `أنت مشترك في هذه الباقة بالفعل ✓`
                : isDowngradeSelected
                ? `تخفيض الباقة إلى ${activePlanObj.label} (بدون رسوم)`
                : isUpgradeSelected && upgradeQuote
                ? `سداد فرق الترقية — ${upgradeQuote.finalAmount} ج.م فقط`
                : isUpgradeSelected
                ? `ترقية إلى ${activePlanObj.label} — ${activePlanObj.price} ج.م`
                : `الدفع والتفعيل الفوري — ${activePlanObj.price} ج.م`}
            </Text>
          </TouchableOpacity>

          <Text style={styles.paymentMethodsNotice}>
            {isCurrentSelected && currentDaysRemaining > 5
              ? `اشتراكك سارٍ لمدة ${currentDaysRemaining} يوماً قادمة • لا حاجة لإعادة السداد`
              : isDowngradeSelected
              ? `أنت مشترك في باقة أعلى بالفعل • لن يتم تحصيل أي مبالغ إضافية`
              : isUpgradeSelected && upgradeQuote
              ? `تم خصم ${upgradeQuote.unusedCredit} ج.م رصيد باقتك السابقة (${upgradeQuote.daysRemaining} يوم) • تجديد الصلاحية لـ 30 يوماً كاملة`
              : `دفع آمن وفوري • فيزا • ماستركارد • ميزة • محافظ إلكترونية`}
          </Text>

          {/* Secondary Action: Check Activation Status */}
          <TouchableOpacity
            style={styles.checkServerBtn}
            onPress={handleCheckAdminActivation}
            disabled={isCheckingServer}
            activeOpacity={0.75}
          >
            {isCheckingServer ? (
              <ActivityIndicator size="small" color="#475569" />
            ) : (
              <Ionicons name="refresh-outline" size={18} color="#475569" />
            )}
            <Text style={styles.checkServerBtnText}>
              {isCheckingServer ? 'جاري التحقق من الخادم...' : 'التحقق من حالة التفعيل'}
            </Text>
          </TouchableOpacity>
        </View>
        )}
      </ScrollView>

      {/* Bottom Sheet Modal for Subscription Steps & Support */}
      <Modal
        visible={showInstructionsModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInstructionsModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowInstructionsModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.bottomSheetCard}>
                <View style={styles.sheetHandle} />
                <TouchableOpacity
                  style={styles.sheetCloseBtn}
                  onPress={() => setShowInstructionsModal(false)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>

                <View style={styles.sheetHeader}>
                  <View style={styles.sheetIconBox}>
                    <Ionicons name="information-circle-outline" size={24} color="#4F46E5" />
                  </View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}>
                    <Text style={styles.sheetTitle}>خطوات الاشتراك والتفعيل</Text>
                    <Text style={styles.sheetSubtitle}>طرق السداد والتفعيل المعتمدة</Text>
                  </View>
                </View>

                <View style={styles.stepsList}>
                  <View style={styles.stepItemRow}>
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>1</Text>
                    </View>
                    <View style={styles.stepContent}>
                      <Text style={styles.stepItemTitle}>الدفع الإلكتروني المباشر</Text>
                      <Text style={styles.stepItemDesc}>
                        اختر الباقة واضغط على «الدفع والتفعيل الفوري» للسداد بأمان عبر كاشير (فيزا، ماستركارد، ميزة، أو المحافظ). يتم التفعيل لحظياً.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stepItemRow}>
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>2</Text>
                    </View>
                    <View style={styles.stepContent}>
                      <Text style={styles.stepItemTitle}>التحويل عبر إنستاباي أو فودافون كاش</Text>
                      <Text style={styles.stepItemDesc}>
                        يمكنك تحويل قيمة الاشتراك ثم إرسال الإشعار للدعم الفني لتفعيل حسابك مباشرة.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.stepItemRow}>
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>3</Text>
                    </View>
                    <View style={styles.stepContent}>
                      <Text style={styles.stepItemTitle}>التحقق ومزامنة الحساب</Text>
                      <Text style={styles.stepItemDesc}>
                        في حال التحويل عبر الدعم، اضغط على زر «التحقق من حالة التفعيل» لتحديث بيانات حسابك فوراً.
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Direct WhatsApp Support */}
                <TouchableOpacity
                  style={styles.sheetWhatsappBtn}
                  onPress={() => {
                    setShowInstructionsModal(false);
                    Linking.openURL(
                      `https://wa.me/201550888841?text=${encodeURIComponent(
                        `مرحباً، أود الاستفسار عن تفعيل باقة اشتراك XPharma (${activePlanObj.label})`
                      )}`
                    );
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                  <Text style={styles.sheetWhatsappBtnText}>
                    تواصل مع الدعم الفني عبر واتساب (01550888841)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.sheetDismissBtn}
                  onPress={() => setShowInstructionsModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sheetDismissBtnText}>إغلاق</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Bottom-sheet notice modal — replaces all native Alert.alert calls */}
      <SubscriptionNoticeModal
        visible={noticeModal.visible}
        type={noticeModal.type}
        title={noticeModal.title}
        message={noticeModal.message}
        badgeText={noticeModal.badgeText}
        primaryButtonText={noticeModal.primaryButtonText}
        onPrimaryPress={noticeModal.onPrimaryPress}
        secondaryButtonText={noticeModal.secondaryButtonText}
        onSecondaryPress={noticeModal.onSecondaryPress}
        onClose={closeNotice}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtnClean: {
    padding: 6,
  },
  topHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  infoBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  reasonBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  reasonBannerText: {
    fontSize: 12.5,
    color: '#3730A3',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  expiredBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.2,
    borderColor: '#FCA5A5',
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  expiredBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#991B1B',
    textAlign: 'right',
  },
  expiredBannerSub: {
    fontSize: 11.5,
    color: '#B91C1C',
    textAlign: 'right',
    marginTop: 2,
  },
  sectionHeaderRow: {
    marginTop: 2,
    marginBottom: 2,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  sectionHeaderSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
    marginTop: 2,
  },
  plansList: {
    gap: 10,
  },
  planCardItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingVertical: 14,
    paddingHorizontal: 16,
    position: 'relative',
  },
  planCardItemSelected: {
    borderColor: '#4F46E5',
    backgroundColor: '#FAF5FF',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  planCardRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: '#4F46E5',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4F46E5',
  },
  planNameCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  planTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  planLabel: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  planLabelSelected: {
    color: '#4F46E5',
  },
  popularBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  popularBadgeText: {
    color: '#4F46E5',
    fontSize: 11,
    fontWeight: '700',
  },
  planLimitText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  priceContainer: {
    alignItems: 'flex-start',
  },
  priceNumber: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  priceNumberSelected: {
    color: '#4F46E5',
  },
  priceCurrency: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  actionsContainer: {
    gap: 8,
    marginTop: 6,
  },
  primaryBtn: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    height: 52,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  currentPlanBtn: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#10B981',
    shadowOpacity: 0.1,
  },
  currentPlanBtnText: {
    color: '#065F46',
  },
  downgradeBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.1,
  },
  downgradeBtnText: {
    color: '#B45309',
  },
  paymentMethodsNotice: {
    textAlign: 'center',
    fontSize: 11.5,
    color: '#94A3B8',
    fontWeight: '500',
    marginVertical: 2,
  },
  checkServerBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    height: 48,
  },
  checkServerBtnText: {
    color: '#475569',
    fontSize: 13.5,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 9999,
  },
  bottomSheetCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 38 : 28,
    position: 'relative',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetCloseBtn: {
    position: 'absolute',
    top: 14,
    left: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  sheetHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  sheetIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  sheetSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'right',
    marginTop: 2,
  },
  stepsList: {
    gap: 14,
    marginBottom: 18,
  },
  stepItemRow: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepBadgeText: {
    color: '#4F46E5',
    fontSize: 13,
    fontWeight: '800',
  },
  stepContent: {
    flex: 1,
    alignItems: 'flex-end',
  },
  stepItemTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
  },
  stepItemDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
    marginTop: 2,
    lineHeight: 17,
  },
  sheetWhatsappBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 13,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  sheetWhatsappBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  sheetDismissBtn: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetDismissBtnText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  currentBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  currentBadgeText: {
    color: '#15803D',
    fontSize: 11,
    fontWeight: '700',
  },
  planCardItemCurrent: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  planLabelCurrent: {
    color: '#065F46',
  },
  priceNumberCurrent: {
    color: '#065F46',
  },
  radioOuterCurrent: {
    borderColor: '#10B981',
  },
  radioInnerCurrent: {
    backgroundColor: '#10B981',
  },
  prorationCard: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1.2,
    borderColor: '#DDD6FE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 4,
    gap: 6,
  },
  prorationHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  prorationTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4F46E5',
    textAlign: 'right',
  },
  prorationRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prorationLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  prorationValue: {
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '700',
  },
  prorationCredit: {
    fontSize: 12.5,
    color: '#059669',
    fontWeight: '800',
  },
  prorationDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 2,
  },
  prorationTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  prorationTotalValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#4F46E5',
  },
});
