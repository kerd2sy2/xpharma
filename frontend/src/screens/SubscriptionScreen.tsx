import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
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
} from '@/services/subscription';
import { useAuth } from '@/context/AuthContext';

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
  suggestedPlan = 3,
  onSubscribed,
  onBack,
}: SubscriptionScreenProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0);
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<number>(suggestedPlan || (isTrialExpired ? 1 : 3));
  const [showSuccess, setShowSuccess] = useState(false);
  const [activatedPlanObj, setActivatedPlanObj] = useState<PricingPlan | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [isProcessingKashier, setIsProcessingKashier] = useState(false);

  useEffect(() => {
    if (suggestedPlan) {
      setSelectedPlan(suggestedPlan);
    } else if (isTrialExpired) {
      setSelectedPlan(1);
    }
  }, [suggestedPlan, isTrialExpired]);

  const activePlanObj = PRICING_PLANS.find((p) => p.pharmacies === selectedPlan) || PRICING_PLANS[0];

  // Handle Android hardware back button
  useEffect(() => {
    const onBackPress = () => {
      if (showSuccess) {
        setShowSuccess(false);
      } else {
        onBack();
      }
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [showSuccess, onBack]);

  const handlePayWithKashier = async () => {
    if (!user?.email) {
      Alert.alert('تنبيه', 'يرجى تسجيل الدخول بحسابك أولاً لإتمام الدفع الإلكتروني.');
      return;
    }

    setIsProcessingKashier(true);
    try {
      const res = await initiateKashierPayment({
        email: user.email,
        plan: selectedPlan,
        userName: user.name,
      });

      if (!res.success || !res.session_url) {
        Alert.alert('تعذر فتح بوابة كاشير', res.error || 'يرجى المحاولة مرة أخرى أو الدفع عبر واتساب.');
        setIsProcessingKashier(false);
        return;
      }

      // Open AuthSession that intercepts xpharma:// redirect and closes browser automatically
      const result = await WebBrowser.openAuthSessionAsync(
        res.session_url,
        'xpharma://'
      );

      // Immediately persist selected plan locally and notify servers
      await setActiveSubscriptionPlan(selectedPlan);
      try {
        await recordSubscriptionPayment({
          user_email: user?.email || '',
          user_name: user?.name || 'دكتور صيدلي',
          user_phone: user?.phone || '',
          plan_type: `${selectedPlan} صيدليات`,
          amount: activePlanObj.price,
          payment_method: 'kashier',
          status: 'active',
          order_id: res.order_id || '',
          notes: `اشتراك إلكتروني ناجح بحساب Google (${user?.email || ''}) - باقة ${activePlanObj.label}`,
        });
      } catch (e) {
        console.warn('Record billing error:', e);
      }

      // Fetch fresh status and activate plan UI
      setIsCheckingServer(true);
      try {
        await getSubscriptionStatus(user.email);
      } catch {}
      setActivatedPlanObj(activePlanObj);
      setShowSuccess(true);
      if (onSubscribed) onSubscribed(selectedPlan);
      setIsCheckingServer(false);
    } catch (e: any) {
      Alert.alert('خطأ', 'حدث خطأ أثناء فتح بوابة الدفع: ' + (e.message || 'يرجى المحاولة لاحقاً'));
    } finally {
      setIsProcessingKashier(false);
    }
  };


  const handleCheckAdminActivation = async () => {
    if (!user?.email) {
      Alert.alert('تنبيه', 'يرجى تسجيل الدخول بحسابك أولاً للتحقق من حالة الاشتراك.');
      return;
    }
    setIsCheckingServer(true);
    try {
      const status = await getSubscriptionStatus(user.email);
      if (status.isSubscribed && status.subscribedPlan > 0) {
        const matchingPlan = PRICING_PLANS.find((p) => p.pharmacies === status.subscribedPlan) || PRICING_PLANS[0];
        setActivatedPlanObj(matchingPlan);
        setShowSuccess(true);
        if (onSubscribed) onSubscribed(status.subscribedPlan);
      } else {
        Alert.alert(
          'طلبك قيد المراجعة ⏳',
          'لم يتم تفعيل الباقة حتى الآن.\n\nإذا أتممت الدفع عبر كاشير أو واتساب سيتم التفعيل تلقائياً، يمكنك التحقق مجدداً بعد لحظات.'
        );
      }
    } catch (e) {
      Alert.alert('خطأ', 'تعذر الاتصال بالخادم. يرجى التأكد من اتصال الإنترنت والمحاولة مرة أخرى.');
    } finally {
      setIsCheckingServer(false);
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    onBack();
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" translucent={false} />

      {/* Top Header: Matching WarehousePortal header */}
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
        <View style={styles.topHeaderSpacer} />
      </View>

      {showSuccess ? (
        /* ========================================================= */
        /* 1. SUCCESS ACTIVATION VIEW                                */
        /* ========================================================= */
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.successContainer}>
            {/* Hero Celebration Card */}
            <LinearGradient
              colors={['#0F2B1E', '#064E3B', '#047857']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.successHeroCard}
            >
              <View style={styles.successIconGlowRing}>
                <View style={styles.successIconCircle}>
                  <Ionicons name="sparkles" size={36} color="#FBBF24" />
                </View>
              </View>

              <Text style={styles.successHeroTitle}>تم تفعيل الباقة بنجاح 🎉</Text>
              <Text style={styles.successHeroSubtitle}>
                حسابك الآن نشط ومفعل مع كافة المزايا المتقدمة
              </Text>

              <View style={styles.activePlanPill}>
                <Ionicons name="shield-checkmark" size={16} color="#34D399" />
                <Text style={styles.activePlanPillText}>
                  {activatedPlanObj?.label || activePlanObj.label} • {activatedPlanObj?.price || activePlanObj.price} ج.م / شهر
                </Text>
              </View>
            </LinearGradient>

            {/* Unlocked Features List */}
            <View style={styles.unlockedBox}>
              <Text style={styles.unlockedHeaderTitle}>المزايا المفعلة لحسابك:</Text>

              <View style={styles.unlockedItem}>
                <View style={[styles.checkCircle, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="checkmark-sharp" size={16} color="#059669" />
                </View>
                <View style={styles.unlockedTextCol}>
                <Text style={styles.unlockedItemTitle}>ربط حتى {activatedPlanObj?.pharmacies || activePlanObj.pharmacies} صيدليات في كل مخزن</Text>
                <Text style={styles.unlockedItemSub}>يمكنك الآن ربط حتى {activatedPlanObj?.pharmacies || activePlanObj.pharmacies} فروع في المخزن الواحد، ومتاح فتح كافة المخازن بلا حدود</Text>
              </View>
              </View>

              <View style={styles.unlockedItem}>
                <View style={[styles.checkCircle, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="checkmark-sharp" size={16} color="#059669" />
                </View>
                <View style={styles.unlockedTextCol}>
                  <Text style={styles.unlockedItemTitle}>مزامنة فورية لكافة المخازن</Text>
                  <Text style={styles.unlockedItemSub}>اطلاع مباشر على الفواتير، المرتجعات، والمدفوعات لحظة بلحظة</Text>
                </View>
              </View>

              <View style={styles.unlockedItem}>
                <View style={[styles.checkCircle, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="checkmark-sharp" size={16} color="#059669" />
                </View>
                <View style={styles.unlockedTextCol}>
                  <Text style={styles.unlockedItemTitle}>كشف حساب تفصيلي 24/7</Text>
                  <Text style={styles.unlockedItemSub}>مطابقات مالية دقيقة وأرشفة سحابية لكافة المعاملات</Text>
                </View>
              </View>
            </View>

            {/* Done / Start Button */}
            <TouchableOpacity
              style={styles.successDoneBtn}
              onPress={handleCloseSuccess}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#047857', '#065F46']}
                style={styles.successDoneBtnGradient}
              >
                <Ionicons name="rocket-outline" size={20} color="#FFFFFF" />
                <Text style={styles.successDoneBtnText}>ابدأ استخدام التطبيق الآن</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        /* ========================================================= */
        /* 2. MAIN PLANS SELECTION VIEW                              */
        /* ========================================================= */
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Hero Header Banner */}
          <LinearGradient
            colors={['#25044A', '#3F0082', '#5610A3']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <View style={styles.heroIconBox}>
              <MaterialCommunityIcons name="crown" size={32} color="#FBBF24" />
            </View>
            <Text style={styles.heroTitle}>باقات وخطط الاشتراك الشهري</Text>
            <Text style={styles.heroSubtitle}>
              {reason || 'الباقة تحدد عدد الصيدليات المسموح بربطها في المخزن الواحد (مع فتح كافة المخازن مجاناً)'}
            </Text>
          </LinearGradient>

          {/* Trial Expired Alert Banner */}
          {isTrialExpired && (
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

          {/* Pricing Tiers */}
          <Text style={styles.sectionHeaderTitle}>اختر الباقة المناسبة:</Text>

          <View style={styles.plansList}>
            {PRICING_PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.pharmacies;
              return (
                <TouchableOpacity
                  key={plan.pharmacies}
                  style={[
                    styles.planCardItem,
                    isSelected && styles.planCardItemSelected,
                  ]}
                  onPress={() => setSelectedPlan(plan.pharmacies)}
                  activeOpacity={0.85}
                >
                  {plan.popular && (
                    <View style={styles.popularTag}>
                      <Text style={styles.popularTagText}>الأكثر طلباً ⭐</Text>
                    </View>
                  )}

                  <View style={styles.planCardHeader}>
                    {/* Radio Button Selector */}
                    <View
                      style={[
                        styles.radioOuter,
                        isSelected && styles.radioOuterSelected,
                      ]}
                    >
                      {isSelected && <View style={styles.radioInner} />}
                    </View>

                    {/* Plan Name & Tag */}
                    <View style={styles.planNameCol}>
                      <Text style={[styles.planLabel, isSelected && styles.planLabelSelected]}>
                        {plan.label}
                      </Text>
                      <Text style={styles.planLimitText}>
                        {plan.pharmacies === 1
                          ? 'ربط صيدلية واحدة في المخزن الواحد'
                          : plan.pharmacies === 2
                          ? 'ربط حتى صيدليتين في المخزن الواحد'
                          : `ربط حتى ${plan.pharmacies} صيدليات في المخزن الواحد`}
                      </Text>
                    </View>

                    {/* Price Tag */}
                    <View style={styles.priceContainer}>
                      <Text style={[styles.priceNumber, isSelected && styles.priceNumberSelected]}>
                        {plan.price}
                      </Text>
                      <Text style={styles.priceCurrency}>ج.م / شهر</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Features Comparison Box */}
          <View style={styles.featuresBox}>
            <Text style={styles.featuresBoxTitle}>ما تشمله باقتك:</Text>
            <View style={styles.featureLine}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <Text style={styles.featureLineText}>
                {activePlanObj.pharmacies === 1
                  ? 'ربط صيدلية واحدة في كل مخزن على حدة'
                  : activePlanObj.pharmacies === 2
                  ? 'ربط حتى صيدليتين في كل مخزن على حدة'
                  : `ربط حتى ${activePlanObj.pharmacies} صيدليات في كل مخزن على حدة`}
              </Text>
            </View>
            <View style={styles.featureLine}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <Text style={styles.featureLineText}>
                فتح وربط غير محدود مع كافة مخازن الأدوية والمستلزمات في مصر
              </Text>
            </View>
            <View style={styles.featureLine}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <Text style={styles.featureLineText}>
                كشف حساب مباشر، فواتير فورية، ومطابقات دورية
              </Text>
            </View>
            <View style={styles.featureLine}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <Text style={styles.featureLineText}>
                تنبيهات فورية عند إصدار أي فاتورة جديدة باسم صيدليتك
              </Text>
            </View>
            <View style={styles.featureLine}>
              <Ionicons name="checkmark-circle" size={18} color="#10B981" />
              <Text style={styles.featureLineText}>
                دعم فني خاص على مدار الساعة عبر واتساب
              </Text>
            </View>
          </View>

          {/* Activation Instructions Box */}
          <View style={styles.instructionsBox}>
            <View style={styles.instructionsHeaderRow}>
              <Ionicons name="information-circle" size={18} color="#0284C7" />
              <Text style={styles.instructionsTitle}>خطوات تفعيل الاشتراك:</Text>
            </View>
            <Text style={styles.instructionsStep}>1. اختر الباقة واضغط على «تأكيد الاشتراك عبر واتساب» للتواصل مع الإدارة.</Text>
            <Text style={styles.instructionsStep}>2. قم بتحويل قيمة الاشتراك وتأكيد العملية مع فريق الدعم.</Text>
            <Text style={styles.instructionsStep}>3. تقوم الإدارة بتفعيل حسابك على الخادم، ثم اضغط بالأسفل للتحقق فوراً.</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            {/* Primary Action 1: Kashier Instant Online Payment */}
            <TouchableOpacity
              style={styles.kashierBtn}
              onPress={handlePayWithKashier}
              disabled={isProcessingKashier}
              activeOpacity={0.88}
            >
              <LinearGradient
                colors={['#3B0764', '#581C87', '#6B21A8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btnGradient}
              >
                {isProcessingKashier ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="card" size={24} color="#FBBF24" />
                )}
                <View style={styles.btnTextCol}>
                  <Text style={styles.subscribeBtnText}>
                    {isProcessingKashier ? 'جاري تجهيز بوابة الدفع...' : `الدفع والتفعيل الفوري (${activePlanObj.price} ج.م)`}
                  </Text>
                  <Text style={styles.subscribeBtnSub}>
                    كاشير • فيزا • ماستركارد • ميزة • محافظ إلكترونية
                  </Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>


            {/* Action 3: Check Admin Activation Status Button */}
            <TouchableOpacity
              style={styles.checkServerBtn}
              onPress={handleCheckAdminActivation}
              disabled={isCheckingServer}
              activeOpacity={0.8}
            >
              {isCheckingServer ? (
                <ActivityIndicator size="small" color="#4338CA" />
              ) : (
                <Ionicons name="refresh-circle" size={20} color="#4338CA" />
              )}
              <Text style={styles.checkServerBtnText}>
                {isCheckingServer ? 'جاري التحقق من الخادم...' : 'التحقق من تفعيل الحساب من الإدارة'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
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
  topHeaderSpacer: {
    width: 36,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  heroCard: {
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3F0082',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  heroIconBox: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(251, 191, 36, 0.4)',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  expiredBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 14,
    padding: 14,
  },
  expiredBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
    textAlign: 'right',
  },
  expiredBannerSub: {
    fontSize: 12,
    color: '#991B1B',
    textAlign: 'right',
    marginTop: 2,
    lineHeight: 16,
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'right',
    marginTop: 4,
  },
  plansList: {
    gap: 10,
  },
  planCardItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  planCardItemSelected: {
    borderColor: '#6D28D9',
    backgroundColor: '#FBF9FF',
    shadowColor: '#6D28D9',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  popularTag: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#6D28D9',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderBottomLeftRadius: 10,
  },
  popularTagText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  planCardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  radioOuterSelected: {
    borderColor: '#6D28D9',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#6D28D9',
  },
  planNameCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  planLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  planLabelSelected: {
    color: '#6D28D9',
  },
  planLimitText: {
    fontSize: 12.5,
    color: '#64748B',
    marginTop: 2,
  },
  priceContainer: {
    alignItems: 'flex-start',
  },
  priceNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  priceNumberSelected: {
    color: '#6D28D9',
  },
  priceCurrency: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  featuresBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 10,
  },
  featuresBoxTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'right',
    marginBottom: 2,
  },
  featureLine: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  featureLineText: {
    flex: 1,
    fontSize: 12.5,
    color: '#475569',
    fontWeight: '500',
    textAlign: 'right',
    lineHeight: 18,
  },
  actionsContainer: {
    gap: 10,
    marginTop: 4,
  },
  kashierBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#581C87',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  subscribeBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnGradient: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  btnTextCol: {
    alignItems: 'center',
  },
  subscribeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  subscribeBtnSub: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 1,
  },
  instructionsBox: {
    backgroundColor: '#F0F9FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 14,
    gap: 6,
  },
  instructionsHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  instructionsTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0369A1',
    textAlign: 'right',
  },
  instructionsStep: {
    fontSize: 12,
    color: '#0C4A6E',
    textAlign: 'right',
    lineHeight: 18,
    fontWeight: '500',
  },
  checkServerBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderRadius: 14,
    paddingVertical: 13,
  },
  checkServerBtnText: {
    color: '#4338CA',
    fontSize: 13.5,
    fontWeight: '800',
  },
  successContainer: {
    gap: 14,
  },
  successHeroCard: {
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconGlowRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successHeroTitle: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
  },
  successHeroSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  activePlanPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 12,
  },
  activePlanPillText: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '700',
  },
  unlockedBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 14,
  },
  unlockedHeaderTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'right',
  },
  unlockedItem: {
    flexDirection: 'row-reverse',
    alignItems: 'flex-start',
    gap: 10,
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  unlockedTextCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  unlockedItemTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
  },
  unlockedItemSub: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'right',
    marginTop: 2,
    lineHeight: 16,
  },
  successDoneBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 4,
  },
  successDoneBtnGradient: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  successDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
