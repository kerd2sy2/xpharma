import React, { useState, useEffect } from 'react';
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
  UpgradeQuote,
  calculateUpgradeQuote,
  initiateKashierPayment,
  setActiveSubscriptionPlan,
  recordSubscriptionPayment,
  getSubscriptionStatus,
} from '@/services/subscription';
import { useAuth } from '@/context/AuthContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface UpgradeProrationModalProps {
  visible: boolean;
  onClose: () => void;
  warehouseName?: string;
  currentPharmacyCount: number;
  targetPlan?: number;
  onUpgradeSuccess: (newPlan: number) => void;
}

export default function UpgradeProrationModal({
  visible,
  onClose,
  warehouseName,
  currentPharmacyCount,
  targetPlan,
  onUpgradeSuccess,
}: UpgradeProrationModalProps) {
  const { user } = useAuth();
  const [loadingQuote, setLoadingQuote] = useState(true);
  const [quote, setQuote] = useState<UpgradeQuote | null>(null);
  const [isProcessingKashier, setIsProcessingKashier] = useState(false);
  const [isCheckingServer, setIsCheckingServer] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Desired plan: at least currentPharmacyCount + 1, or targetPlan, capped between 2 and 5
  const resolvedTarget = Math.max(2, Math.min(5, targetPlan || currentPharmacyCount + 1));

  useEffect(() => {
    if (!visible) return;

    let isMounted = true;
    const fetchQuote = async () => {
      setLoadingQuote(true);
      try {
        const q = await calculateUpgradeQuote(user?.email || '', resolvedTarget);
        if (isMounted) {
          setQuote(q);
        }
      } catch (err) {
        console.warn('Failed to calculate upgrade quote:', err);
      } finally {
        if (isMounted) setLoadingQuote(false);
      }
    };

    fetchQuote();
    return () => {
      isMounted = false;
    };
  }, [visible, user?.email, resolvedTarget]);

  const handlePayWithKashier = async () => {
    if (!user?.email) {
      Alert.alert('تنبيه', 'يرجى تسجيل الدخول بحسابك أولاً لإتمام الدفع الإلكتروني.');
      return;
    }

    if (!quote) return;

    setIsProcessingKashier(true);
    try {
      const res = await initiateKashierPayment({
        email: user.email,
        plan: quote.targetPlan,
        customAmount: quote.finalAmount,
        userName: user.name,
      });

      if (!res.success || !res.session_url) {
        Alert.alert('تعذر فتح بوابة كاشير', res.error || 'يرجى المحاولة مرة أخرى أو الدفع عبر واتساب.');
        setIsProcessingKashier(false);
        return;
      }

      // Open AuthSession that intercepts xpharma:// redirect and closes browser automatically
      await WebBrowser.openAuthSessionAsync(
        res.session_url,
        'xpharma://'
      );

      // Immediately persist selected plan locally and notify servers
      await setActiveSubscriptionPlan(quote.targetPlan);
      try {
        await recordSubscriptionPayment({
          user_email: user?.email || '',
          user_name: user?.name || 'دكتور صيدلي',
          user_phone: user?.phone || '',
          plan_type: `${quote.targetPlan} صيدليات (ترقية تناسبية)`,
          amount: quote.finalAmount,
          payment_method: 'kashier',
          status: 'active',
          order_id: res.order_id || '',
          notes: `ترقية اشتراك تناسبية إلى باقة ${quote.targetPlan} صيدليات بقيمة ${quote.finalAmount} ج.م بدلاً من ${quote.targetPlanPrice} ج.م (خصم رصيد ${quote.unusedCredit} ج.م)`,
        });
      } catch (err) {
        console.warn('Record payment error:', err);
      }

      // Refresh status from server
      setIsCheckingServer(true);
      try {
        await getSubscriptionStatus(user.email);
      } catch {}
      setIsCheckingServer(false);

      setShowSuccess(true);
      onUpgradeSuccess(quote.targetPlan);
    } catch (e: any) {
      Alert.alert('خطأ', 'حدث خطأ أثناء فتح بوابة الدفع: ' + (e.message || 'يرجى المحاولة لاحقاً'));
    } finally {
      setIsProcessingKashier(false);
    }
  };

  const handleSupportWhatsApp = () => {
    const text = encodeURIComponent(
      `السلام عليكم، أرغب في ترقية اشتراكي في منصة XPharma إلى باقة ${quote?.targetPlan || resolvedTarget} صيدليات لكل مخزن. بريدي الإلكتروني: ${user?.email || ''}`
    );
    Linking.openURL(`https://wa.me/201019688000?text=${text}`).catch(() => {
      Alert.alert('تنبيه', 'تعذر فتح واتساب، رقم الدعم المباشر هو: 01019688000');
    });
  };

  const handleClose = () => {
    setShowSuccess(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalSheet}>
              {/* Sheet Drag Handle */}
              <View style={styles.sheetHandle} />

              {/* Close Button */}
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={handleClose}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={20} color="#334155" />
              </TouchableOpacity>

              {showSuccess ? (
                /* ========================================================= */
                /* 1. SUCCESS ACTIVATION STATE                               */
                /* ========================================================= */
                <View style={styles.successContainer}>
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

                    <Text style={styles.successHeroTitle}>تمت الترقية بنجاح 🎉</Text>
                    <Text style={styles.successHeroSubtitle}>
                      تم ترقية باقتك إلى {quote?.targetPlan || resolvedTarget} صيدليات لكل مخزن
                    </Text>

                    <View style={styles.activePlanPill}>
                      <Ionicons name="shield-checkmark" size={16} color="#34D399" />
                      <Text style={styles.activePlanPillText}>
                        صلاحية 30 يوماً كاملة من اليوم
                      </Text>
                    </View>
                  </LinearGradient>

                  <TouchableOpacity
                    style={styles.successDoneBtn}
                    onPress={handleClose}
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={['#047857', '#065F46']}
                      style={styles.successDoneBtnGradient}
                    >
                      <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.successDoneBtnText}>متابعة إضافة الصيدلية الآن</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : (
                /* ========================================================= */
                /* 2. PRORATED UPGRADE BREAKDOWN VIEW                        */
                /* ========================================================= */
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.scrollContent}
                >
                  {/* Hero Header */}
                  <LinearGradient
                    colors={['#2A084E', '#4C1D95', '#6D28D9']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.heroCard}
                  >
                    <View style={styles.heroIconBox}>
                      <MaterialCommunityIcons name="crown" size={30} color="#FBBF24" />
                    </View>
                    <Text style={styles.heroTitle}>ترقية الباقة لإضافة صيدلية</Text>
                    <Text style={styles.heroSubtitle}>
                      {warehouseName ? `في ${warehouseName}: ` : ''}
                      لديك حالياً {currentPharmacyCount} صيدليات مربوطة، ولإضافة فرع جديد يمكنك الترقية إلى باقة {resolvedTarget} صيدليات
                    </Text>
                  </LinearGradient>

                  {loadingQuote ? (
                    <View style={styles.loadingBox}>
                      <ActivityIndicator size="large" color="#6D28D9" />
                      <Text style={styles.loadingText}>جاري احتساب رصيدك المتبقي وقيمة الترقية...</Text>
                    </View>
                  ) : quote ? (
                    <>
                      {/* Proration Calculation Card */}
                      <View style={styles.quoteCard}>
                        <View style={styles.quoteHeaderRow}>
                          <Ionicons name="calculator-outline" size={18} color="#6D28D9" />
                          <Text style={styles.quoteHeaderTitle}>تفاصيل الحسبة التناسبية لاشتراكك:</Text>
                        </View>

                        {/* Current Plan Row */}
                        <View style={styles.quoteRow}>
                          <View style={styles.quoteRowLabelGroup}>
                            <Text style={styles.quoteRowLabel}>باقتك الحالية</Text>
                            {quote.currentPlan > 0 ? (
                              <Text style={styles.quoteRowSub}>
                                {quote.currentPlan} صيدليات ({quote.currentPlanPrice} ج.م) • متبقي {quote.daysRemaining} يوماً
                              </Text>
                            ) : (
                              <Text style={styles.quoteRowSub}>الباقة الأساسية (مجانية)</Text>
                            )}
                          </View>
                          <Text style={styles.quoteRowValue}>
                            {quote.currentPlan > 0 ? `${quote.currentPlan} فروع` : 'فرع واحد'}
                          </Text>
                        </View>

                        {/* Unused Credit Row (if upgrade) */}
                        {quote.isUpgrade && quote.unusedCredit > 0 && (
                          <View style={[styles.quoteRow, styles.creditRow]}>
                            <View style={styles.quoteRowLabelGroup}>
                              <View style={styles.creditBadgeRow}>
                                <Text style={styles.creditLabel}>رصيدك المحفوظ من الأيام السابقة</Text>
                                <View style={styles.creditPill}>
                                  <Text style={styles.creditPillText}>خصم فوري</Text>
                                </View>
                              </View>
                              <Text style={styles.creditSub}>
                                قيمة {quote.daysRemaining} يوماً متبقية تم ترحيلها وخصمها بالكامل لصالحك
                              </Text>
                            </View>
                            <Text style={styles.creditValue}>-{quote.unusedCredit} ج.م</Text>
                          </View>
                        )}

                        {/* Target Plan Full Price */}
                        <View style={styles.quoteRow}>
                          <View style={styles.quoteRowLabelGroup}>
                            <Text style={styles.quoteRowLabel}>الباقة الجديدة المطلوبة</Text>
                            <Text style={styles.quoteRowSub}>
                              ربط حتى {quote.targetPlan} صيدليات في كل مخزن (مع فتح كل المخازن)
                            </Text>
                          </View>
                          <Text style={styles.quoteRowValue}>{quote.targetPlanPrice} ج.م / شهر</Text>
                        </View>

                        <View style={styles.quoteDivider} />

                        {/* Final Amount Due Today */}
                        <View style={styles.finalTotalRow}>
                          <View style={styles.finalLabelCol}>
                            <Text style={styles.finalTotalLabel}>المبلغ الصافي المطلوب للدفع اليوم:</Text>
                            <Text style={styles.finalTotalSub}>
                              ✨ يبدأ لك شهر جديد كامل (30 يوماً) بباقة {quote.targetPlan} صيدليات من لحظة الدفع
                            </Text>
                          </View>
                          <View style={styles.finalPriceBox}>
                            <Text style={styles.finalPriceNumber}>{quote.finalAmount}</Text>
                            <Text style={styles.finalPriceCurrency}>ج.م فقط</Text>
                          </View>
                        </View>
                      </View>

                      {/* Benefits Summary */}
                      <View style={styles.benefitsCard}>
                        <View style={styles.benefitRow}>
                          <Ionicons name="checkmark-circle" size={17} color="#10B981" />
                          <Text style={styles.benefitText}>
                            إضافة الصيدلية رقم {quote.targetPlan} فوراً لهذا المخزن ومتابعة حساباتها
                          </Text>
                        </View>
                        <View style={styles.benefitRow}>
                          <Ionicons name="checkmark-circle" size={17} color="#10B981" />
                          <Text style={styles.benefitText}>
                            فتح ومزامنة غير محدودة لكافة مخازن الجمهورية
                          </Text>
                        </View>
                        <View style={styles.benefitRow}>
                          <Ionicons name="checkmark-circle" size={17} color="#10B981" />
                          <Text style={styles.benefitText}>
                            فواتير فورية، إشعارات، وكشف حساب لحظي على مدار الساعة
                          </Text>
                        </View>
                      </View>

                      {/* Payment Actions */}
                      <View style={styles.actionsContainer}>
                        {/* Instant Kashier Payment */}
                        <TouchableOpacity
                          style={styles.kashierBtn}
                          onPress={handlePayWithKashier}
                          disabled={isProcessingKashier || isCheckingServer}
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
                              <Ionicons name="card" size={22} color="#FBBF24" />
                            )}
                            <View style={styles.kashierBtnTextCol}>
                              <Text style={styles.kashierBtnTitle}>
                                {isProcessingKashier ? 'جاري تجهيز بوابة الدفع...' : `ترقية ودفع فوري (${quote.finalAmount} ج.م)`}
                              </Text>
                              <Text style={styles.kashierBtnSub}>
                                كاشير • فيزا • ماستركارد • ميزة • محافظ إلكترونية
                              </Text>
                            </View>
                          </LinearGradient>
                        </TouchableOpacity>

                        {/* WhatsApp Direct Support */}
                        <TouchableOpacity
                          style={styles.whatsappBtn}
                          onPress={handleSupportWhatsApp}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="logo-whatsapp" size={20} color="#16A34A" />
                          <Text style={styles.whatsappBtnText}>
                            الترقية والتحويل المباشر عبر واتساب
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : null}
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
    maxHeight: SCREEN_HEIGHT * 0.94,
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
    gap: 12,
  },
  heroCard: {
    borderRadius: 22,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#4C1D95',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
  },
  heroIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(251, 191, 36, 0.35)',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 4,
  },
  heroSubtitle: {
    color: 'rgba(255, 255, 255, 0.88)',
    fontSize: 12.5,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  loadingBox: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  quoteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  quoteHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  quoteHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'right',
  },
  quoteRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  quoteRowLabelGroup: {
    flex: 1,
    alignItems: 'flex-end',
  },
  quoteRowLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'right',
  },
  quoteRowSub: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'right',
    marginTop: 2,
  },
  quoteRowValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  creditRow: {
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  creditBadgeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  creditLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },
  creditPill: {
    backgroundColor: '#16A34A',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  creditPillText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  creditSub: {
    fontSize: 11,
    color: '#15803D',
    textAlign: 'right',
    marginTop: 2,
  },
  creditValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#16A34A',
  },
  quoteDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 4,
  },
  finalTotalRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FAF5FF',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
  },
  finalLabelCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  finalTotalLabel: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#5B21B6',
    textAlign: 'right',
  },
  finalTotalSub: {
    fontSize: 11,
    color: '#7C3AED',
    textAlign: 'right',
    marginTop: 3,
    lineHeight: 15,
  },
  finalPriceBox: {
    alignItems: 'center',
    marginLeft: 8,
  },
  finalPriceNumber: {
    fontSize: 24,
    fontWeight: '900',
    color: '#6D28D9',
  },
  finalPriceCurrency: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7C3AED',
  },
  benefitsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  benefitRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  benefitText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
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
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  kashierBtnGradient: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  kashierBtnTextCol: {
    alignItems: 'center',
  },
  kashierBtnTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  kashierBtnSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  whatsappBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    borderRadius: 16,
    paddingVertical: 13,
  },
  whatsappBtnText: {
    color: '#166534',
    fontSize: 13.5,
    fontWeight: '800',
  },
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
  successDoneBtn: {
    width: '100%',
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
