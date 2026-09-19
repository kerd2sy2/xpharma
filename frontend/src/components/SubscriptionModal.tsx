import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SubscriptionModalProps {
  visible: boolean;
  onClose: () => void;
  reason?: string;
  isTrialExpired?: boolean;
  suggestedPlan?: number;
  onSubscribed?: (planCount: number) => void;
}

export default function SubscriptionModal({
  visible,
  onClose,
  reason,
  isTrialExpired = false,
  suggestedPlan = 3,
  onSubscribed,
}: SubscriptionModalProps) {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<number>(suggestedPlan || 3);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activatedPlanObj, setActivatedPlanObj] = useState<PricingPlan | null>(null);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [isProcessingKashier, setIsProcessingKashier] = useState(false);

  const activePlanObj = PRICING_PLANS.find((p) => p.pharmacies === selectedPlan) || PRICING_PLANS[0];

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

      // If user finished payment and returned:
      if (result.type === 'success') {
        const returnUrl = result.url || '';
        if (
          returnUrl.includes('SUCCESS') ||
          returnUrl.includes('CAPTURED') ||
          returnUrl.includes('PAID') ||
          returnUrl.includes('subscription-success') ||
          !returnUrl.includes('FAILED')
        ) {
          await setActiveSubscriptionPlan(selectedPlan);
          setActivatedPlanObj(activePlanObj);
          setShowSuccess(true);
          if (onSubscribed) onSubscribed(selectedPlan);
          return;
        }
      }

      // Check server for activation
      setIsCheckingServer(true);
      setTimeout(async () => {
        try {
          const status = await getSubscriptionStatus(user.email);
          if (status.isSubscribed && status.subscribedPlan > 0) {
            const matchingPlan = PRICING_PLANS.find((p) => p.pharmacies === status.subscribedPlan) || PRICING_PLANS[0];
            setActivatedPlanObj(matchingPlan);
            setShowSuccess(true);
            if (onSubscribed) onSubscribed(status.subscribedPlan);
          } else {
            // Offer confirmation to instantly unlock
            Alert.alert(
              'تأكيد الدفع',
              'هل أتممت عملية الدفع بنجاح في كاشير لتفعيل باقتك فوراً؟',
              [
                { text: 'إلغاء', style: 'cancel' },
                {
                  text: 'نعم، تم الدفع بنجاح',
                  onPress: async () => {
                    await setActiveSubscriptionPlan(selectedPlan);
                    recordSubscriptionPayment({
                      user_email: user?.email || '',
                      user_name: user?.name || 'دكتور صيدلي',
                      user_phone: user?.phone || '',
                      plan_type: `${selectedPlan} صيدليات`,
                      amount: activePlanObj.price,
                      payment_method: 'kashier',
                      status: 'active',
                      order_id: res.order_id || '',
                      notes: `تفعيل فوري لاشتراك باقة ${activePlanObj.label} عبر تطبيق XPharma`,
                    }).catch(() => {});
                    setActivatedPlanObj(activePlanObj);
                    setShowSuccess(true);
                    if (onSubscribed) onSubscribed(selectedPlan);
                  },
                },
              ]
            );
          }
        } catch {}
        setIsCheckingServer(false);
      }, 800);
    } catch (e: any) {
      Alert.alert('خطأ', 'حدث خطأ أثناء فتح بوابة الدفع: ' + (e.message || 'يرجى المحاولة لاحقاً'));
    } finally {
      setIsProcessingKashier(false);
    }
  };

  const handleSubscribeWhatsApp = async () => {
    const text = encodeURIComponent(
      `السلام عليكم، أرغب في الاشتراك في باقات إكس فارما:\n` +
      `• الباقة: ${activePlanObj.label} (${activePlanObj.pharmacies} صيدليات)\n` +
      `• السعر: ${activePlanObj.price} ج.م / شهرياً\n` +
      `• اسم المستخدم: ${user?.name || 'دكتور صيدلي'}\n` +
      `• البريد: ${user?.email || '—'}\n` +
      `• الجهاز: ${user?.deviceId || '—'}`
    );

    const whatsappUrl = `https://wa.me/201019688000?text=${text}`;

    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Linking.openURL(`https://api.whatsapp.com/send?text=${text}`);
      }
    } catch {
      // Fallback
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
    onClose();
  };

  const handleDismissModal = () => {
    if (showSuccess) {
      handleCloseSuccess();
    } else if (!isTrialExpired) {
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={isTrialExpired && !showSuccess ? undefined : handleDismissModal}
    >
      <TouchableWithoutFeedback onPress={handleDismissModal}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalSheet}>
              {/* Sheet Drag Handle */}
              <View style={styles.sheetHandle} />

              {/* Close Button */}
              {(!isTrialExpired || showSuccess) && (
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={handleDismissModal}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color="#334155" />
                </TouchableOpacity>
              )}

              {/* ========================================================= */}
              {/* 1. SUCCESS ACTIVATION STATE (موديول تم تفعيل الباقة الفاخر) */}
              {/* ========================================================= */}
              {showSuccess ? (
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
                        <Text style={styles.unlockedItemTitle}>ربط {activatedPlanObj?.pharmacies || activePlanObj.pharmacies} صيدليات / فروع</Text>
                        <Text style={styles.unlockedItemSub}>يمكنك الآن ربط وإضافة كافة فروعك والتبديل بينهم بضغطة واحدة</Text>
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
              ) : (
                /* ========================================================= */
                /* 2. MAIN PLANS & SUBSCRIPTION SELECTION VIEW               */
                /* ========================================================= */
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.scrollContent}
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
                      {reason || 'اختر الباقة المناسبة لعدد صيدلياتك للربط مع جميع مخازن الجمهورية'}
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

                          <View style={styles.planCardRight}>
                            <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                              {isSelected && <View style={styles.radioDot} />}
                            </View>

                            <View style={styles.planDetailsCol}>
                              <Text style={[styles.planTitleText, isSelected && { color: '#3F0082' }]}>
                                {plan.label}
                              </Text>
                              <Text style={styles.planSubtitleText}>{plan.subtitle}</Text>
                            </View>
                          </View>

                          <View style={styles.planPriceBox}>
                            <Text style={[styles.planPriceValue, isSelected && { color: '#3F0082' }]}>
                              {plan.price}
                            </Text>
                            <Text style={styles.planPricePeriod}>ج.م / شهر</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Features Summary Card */}
                  <View style={styles.featuresCard}>
                    <Text style={styles.featuresCardHeader}>كل باقة تمنحك المميزات التالية:</Text>
                    <View style={styles.featureItemRow}>
                      <Ionicons name="checkmark-circle" size={17} color="#10B981" />
                      <Text style={styles.featureItemText}>ربط غير محدود بجميع مخازن الأدوية والمستلزمات في مصر</Text>
                    </View>
                    <View style={styles.featureItemRow}>
                      <Ionicons name="checkmark-circle" size={17} color="#10B981" />
                      <Text style={styles.featureItemText}>متابعة فواتير المشتريات، المرتجعات، والمدفوعات لحظياً</Text>
                    </View>
                    <View style={styles.featureItemRow}>
                      <Ionicons name="checkmark-circle" size={17} color="#10B981" />
                      <Text style={styles.featureItemText}>كشوفات حساب تفصيلية ومطابقات مالية مؤتمتة</Text>
                    </View>
                  </View>

                  {/* Actions Column */}
                  <View style={styles.actionsBox}>
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
                        style={styles.kashierBtnGradient}
                      >
                        {isProcessingKashier ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Ionicons name="card" size={20} color="#FBBF24" />
                        )}
                        <Text style={styles.kashierBtnText}>
                          {isProcessingKashier ? 'جاري تجهيز بوابة الدفع...' : `الدفع والتفعيل الفوري (${activePlanObj.price} ج.م)`}
                        </Text>
                      </LinearGradient>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.whatsappBtn}
                      onPress={handleSubscribeWhatsApp}
                      activeOpacity={0.88}
                    >
                      <Ionicons name="logo-whatsapp" size={21} color="#FFFFFF" />
                      <Text style={styles.whatsappBtnText}>
                        تحويل يدوي وتأكيد عبر واتساب ({activePlanObj.price} ج.م)
                      </Text>
                    </TouchableOpacity>

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
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 10, 30, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#F8FAFC',
    width: '100%',
    maxHeight: SCREEN_HEIGHT * 0.92,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingHorizontal: 18,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    left: 18,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  heroCard: {
    borderRadius: 22,
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#3F0082',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  heroIconBox: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 4,
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12.5,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
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
    marginBottom: 14,
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
  sectionHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'right',
    marginBottom: 10,
    marginRight: 4,
  },
  plansList: {
    gap: 10,
    marginBottom: 14,
  },
  planCardItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  planCardItemSelected: {
    backgroundColor: '#FAF5FF',
    borderColor: '#7C3AED',
    borderWidth: 2,
  },
  popularTag: {
    position: 'absolute',
    top: -9,
    left: 14,
    backgroundColor: '#3F0082',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  popularTagText: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },
  planCardRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#7C3AED',
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#7C3AED',
  },
  planDetailsCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  planTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  planSubtitleText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'right',
    marginTop: 2,
  },
  planPriceBox: {
    alignItems: 'center',
  },
  planPriceValue: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  planPricePeriod: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  featuresCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    marginBottom: 16,
  },
  featuresCardHeader: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'right',
    marginBottom: 2,
  },
  featureItemRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  featureItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textAlign: 'right',
    flex: 1,
  },
  actionsBox: {
    gap: 10,
  },
  kashierBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#581C87',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  kashierBtnGradient: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  kashierBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  whatsappBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 14,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  whatsappBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  checkServerBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderRadius: 16,
    paddingVertical: 13,
  },
  checkServerBtnText: {
    color: '#4338CA',
    fontSize: 14,
    fontWeight: '800',
  },

  // ==========================================
  // STYLES FOR ACTIVATION SUCCESS SCREEN
  // ==========================================
  successContainer: {
    paddingVertical: 10,
    alignItems: 'center',
    width: '100%',
  },
  successHeroCard: {
    borderRadius: 24,
    width: '100%',
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
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
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successHeroTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 4,
  },
  successHeroSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 14,
  },
  activePlanPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  activePlanPillText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  unlockedBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 14,
    marginBottom: 20,
  },
  unlockedHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'right',
    marginBottom: 2,
  },
  unlockedItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  checkCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  unlockedTextCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  unlockedItemTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  unlockedItemSub: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
    textAlign: 'right',
    marginTop: 2,
  },
  successDoneBtn: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  successDoneBtnGradient: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  successDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
});
