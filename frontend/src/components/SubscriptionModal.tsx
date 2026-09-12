import React, { useState } from 'react';
import {
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
import { PRICING_PLANS, PricingPlan, setActiveSubscriptionPlan } from '@/services/subscription';
import { useAuth } from '@/context/AuthContext';

const { width } = Dimensions.get('window');

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
  suggestedPlan = 2,
  onSubscribed,
}: SubscriptionModalProps) {
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<number>(suggestedPlan || 2);

  const colors = {
    bg: '#FFFFFF',
    card: '#F8FAFC',
    cardActive: '#FAF5FF',
    text: '#1E1B4B',
    secondaryText: '#64748B',
    border: '#E2E8F0',
    borderActive: '#7C3AED',
    primary: '#3F0082',
    primarySoft: 'rgba(63, 0, 130, 0.08)',
    accent: '#00D780',
    gold: '#F59E0B',
  };

  const activePlanObj = PRICING_PLANS.find((p) => p.pharmacies === selectedPlan) || PRICING_PLANS[0];

  const handleSubscribeWhatsApp = async () => {
    const text = encodeURIComponent(
      `السلام عليكم، أرغب في الاشتراك في تطبيق إكس فارما:\n` +
      `• الباقة: ${activePlanObj.label} (${activePlanObj.pharmacies} صيدليات)\n` +
      `• السعر: ${activePlanObj.price} ج.م / شهرياً\n` +
      `• اسم المستخدم: ${user?.name || 'دكتور صيدلي'}\n` +
      `• البريد: ${user?.email || '—'}`
    );

    // Support phone number (WhatsApp)
    const whatsappUrl = `https://wa.me/201012345678?text=${text}`;

    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Linking.openURL(`https://api.whatsapp.com/send?text=${text}`);
      }
    } catch {
      Alert.alert('تواصل مع الدعم', `يرجى التواصل مع الدعم الفني للاشتراك في باقة ${activePlanObj.label}`);
    }
  };

  const handleSimulateActivation = async () => {
    // Allows immediate local upgrade / testing
    await setActiveSubscriptionPlan(selectedPlan);
    if (onSubscribed) onSubscribed(selectedPlan);
    Alert.alert(
      'تم تفعيل الباقة بنجاح',
      `تم ترقية حسابك إلى ${activePlanObj.label} (${activePlanObj.price} ج.م / شهر). يمكنك الآن إضافة فروع صيدلياتك.`,
      [{ text: 'حسناً', onPress: onClose }]
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={isTrialExpired ? undefined : onClose}
    >
      <TouchableWithoutFeedback onPress={isTrialExpired ? undefined : onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={[styles.modalSheet, { backgroundColor: colors.bg }]}>
              {/* Drag Handle */}
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

              {/* Close Button (Hidden if trial strictly expired) */}
              {!isTrialExpired && (
                <TouchableOpacity
                  style={[styles.closeBtn, { borderColor: colors.border }]}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>
              )}

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                {/* Crown / Hero Badge */}
                <View style={styles.heroBadgeBox}>
                  <View style={[styles.heroIconCircle, { backgroundColor: colors.primarySoft }]}>
                    <MaterialCommunityIcons name="crown" size={32} color="#F59E0B" />
                  </View>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>
                    باقات وخطط الاشتراك الشهري
                  </Text>
                  <Text style={[styles.modalSubtitle, { color: colors.secondaryText }]}>
                    {reason || 'الفترة التجريبية تتيح صيدلية واحدة مجاناً لمدة 7 أيام على جميع المخازن'}
                  </Text>
                </View>

                {/* Trial Alert Banner if trial expired */}
                {isTrialExpired && (
                  <View style={styles.expiredBanner}>
                    <Ionicons name="alert-circle" size={20} color="#DC2626" />
                    <Text style={styles.expiredBannerText}>
                      انتهت الفترة التجريبية (7 أيام). يرجى اختيار باقة للاستمرار في استخدام التطبيق.
                    </Text>
                  </View>
                )}

                {/* Pricing Tiers Selection */}
                <Text style={[styles.sectionTitle, { color: colors.text }]}>اختر الباقة المناسبة لفروعك:</Text>

                <View style={styles.plansContainer}>
                  {PRICING_PLANS.map((plan) => {
                    const isSelected = selectedPlan === plan.pharmacies;
                    return (
                      <TouchableOpacity
                        key={plan.pharmacies}
                        style={[
                          styles.planCard,
                          {
                            backgroundColor: isSelected ? colors.cardActive : colors.card,
                            borderColor: isSelected ? colors.borderActive : colors.border,
                            borderWidth: isSelected ? 2 : 1,
                          },
                        ]}
                        onPress={() => setSelectedPlan(plan.pharmacies)}
                        activeOpacity={0.8}
                      >
                        {plan.popular && (
                          <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                            <Text style={styles.popularBadgeText}>الأكثر طلباً ⭐</Text>
                          </View>
                        )}

                        <View style={styles.planCardRight}>
                          <View style={[styles.radioButton, isSelected && { borderColor: colors.borderActive }]}>
                            {isSelected && <View style={[styles.radioButtonInner, { backgroundColor: colors.borderActive }]} />}
                          </View>
                          <View style={styles.planTextCol}>
                            <Text style={[styles.planTitle, { color: colors.text }]}>{plan.label}</Text>
                            <Text style={[styles.planSubtitle, { color: colors.secondaryText }]}>{plan.subtitle}</Text>
                          </View>
                        </View>

                        <View style={styles.planPriceCol}>
                          <Text style={[styles.planPrice, { color: colors.primary }]}>{plan.price}</Text>
                          <Text style={[styles.planPeriod, { color: colors.secondaryText }]}>ج.م / شهر</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Included Features */}
                <View style={[styles.featuresBox, { borderColor: colors.border, backgroundColor: '#F8FAFC' }]}>
                  <Text style={[styles.featuresTitle, { color: colors.text }]}>مميزات الاشتراك:</Text>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={17} color={colors.accent} />
                    <Text style={[styles.featureText, { color: colors.text }]}>
                      ربط غير محدود بجميع مخازن الأدوية والمستلزمات في مصر
                    </Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={17} color={colors.accent} />
                    <Text style={[styles.featureText, { color: colors.text }]}>
                      متابعة فورية لفواتير المشتريات، المرتجعات، والمدفوعات لحظة بلحظة
                    </Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={17} color={colors.accent} />
                    <Text style={[styles.featureText, { color: colors.text }]}>
                      كشف حساب تفصيلي ومطابقات مالية دقيقة لكل صيدلية
                    </Text>
                  </View>
                  <View style={styles.featureItem}>
                    <Ionicons name="checkmark-circle" size={17} color={colors.accent} />
                    <Text style={[styles.featureText, { color: colors.text }]}>
                      دعم فني مباشر وتحديثات مستمرة
                    </Text>
                  </View>
                </View>

                {/* CTA Action Buttons */}
                <View style={styles.actionButtonsCol}>
                  <TouchableOpacity
                    style={[styles.whatsappCtaBtn, { backgroundColor: '#10B981' }]}
                    onPress={handleSubscribeWhatsApp}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="logo-whatsapp" size={22} color="#FFFFFF" />
                    <Text style={styles.whatsappCtaBtnText}>
                      اشترك الآن عبر واتساب ({activePlanObj.price} ج.م / شهر)
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.secondaryCtaBtn, { borderColor: colors.primary }]}
                    onPress={handleSimulateActivation}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.secondaryCtaBtnText, { color: colors.primary }]}>
                      تفعيل الباقة فوراً ({activePlanObj.label})
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
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
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    width: '100%',
    maxHeight: '92%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    paddingHorizontal: 20,
    position: 'relative',
  },
  sheetHandle: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    left: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  heroBadgeBox: {
    alignItems: 'center',
    paddingVertical: 10,
    gap: 6,
  },
  heroIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  expiredBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginVertical: 10,
  },
  expiredBannerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: '#B91C1C',
    textAlign: 'right',
  },
  sectionTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    textAlign: 'right',
    marginTop: 12,
    marginBottom: 10,
  },
  plansContainer: {
    gap: 10,
    marginBottom: 16,
  },
  planCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    position: 'relative',
  },
  popularBadge: {
    position: 'absolute',
    top: -9,
    left: 14,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  popularBadgeText: {
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
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#94A3B8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioButtonInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  planTextCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  planTitle: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  planSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    textAlign: 'right',
  },
  planPriceCol: {
    alignItems: 'center',
    paddingLeft: 4,
  },
  planPrice: {
    fontSize: 20,
    fontWeight: '900',
  },
  planPeriod: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  featuresBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 8,
    marginBottom: 16,
  },
  featuresTitle: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    marginBottom: 2,
  },
  featureItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
  },
  actionButtonsCol: {
    gap: 10,
  },
  whatsappCtaBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: 16,
  },
  whatsappCtaBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryCtaBtn: {
    height: 44,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCtaBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
});
