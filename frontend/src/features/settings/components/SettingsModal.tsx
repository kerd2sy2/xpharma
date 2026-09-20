import React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useOTAUpdates } from '../hooks/useOTAUpdates';
import UpdateModal from '@/components/UpdateModal';
import { SubscriptionStatus, PRICING_PLANS } from '@/services/subscription';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  user: {
    id?: string;
    name?: string;
    email?: string;
    photo?: string;
    provider?: string;
  } | null;
  subscriptionStatusInfo: SubscriptionStatus | null;
  onOpenSubscriptionModal: () => void;
  onLogout: () => Promise<void>;
}

export function SettingsModal({
  visible,
  onClose,
  user,
  subscriptionStatusInfo,
  onOpenSubscriptionModal,
  onLogout,
}: SettingsModalProps) {
  const currentPlanNumber = subscriptionStatusInfo?.subscribedPlan && subscriptionStatusInfo.subscribedPlan > 0
    ? subscriptionStatusInfo.subscribedPlan
    : 3;

  const isSubscribed = !!subscriptionStatusInfo?.isSubscribed && currentPlanNumber > 0;
  const matchedPlan = PRICING_PLANS.find((p) => p.pharmacies === currentPlanNumber);
  const planLabel = isSubscribed
    ? (matchedPlan ? matchedPlan.label : `باقة ${currentPlanNumber} صيدليات لكل مخزن`)
    : 'الباقة المجانية (صيدلية لكل مخزن)';
  const planSubtitle = isSubscribed
    ? `حتى ${currentPlanNumber} صيدليات في المخزن الواحد، ومتاح فتح كل المخازن مجاناً وبلا حدود`
    : 'صيدلية واحدة في كل مخزن مجاناً (متاح فتح وربط كافة مخازن الجمهورية)';
  const daysRemaining = subscriptionStatusInfo?.daysRemaining ?? 30;
  const linkedCount = subscriptionStatusInfo?.linkedPharmaciesCount ?? 0;
  const allowedPharmacies = isSubscribed ? currentPlanNumber : 1;

  const {
    checkingUpdate,
    modalVisible,
    modalStatus,
    errorMessage,
    checkForUpdates,
    downloadUpdate,
    restartApp,
    closeUpdateModal,
  } = useOTAUpdates();

  const handleSupportPress = () => {
    Linking.openURL('https://wa.me/201019688000').catch(() => {
      // Fallback
    });
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheetContainer}>
              {/* Top Drag Indicator */}
              <View style={styles.dragHandle} />

              {/* Header Bar */}
              <View style={styles.headerBar}>
                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={20} color="#1E1335" />
                </TouchableOpacity>

                <View style={styles.headerTitleBox}>
                  <Text style={styles.headerTitle}>الحساب والإعدادات</Text>
                  <Text style={styles.headerSubtitle}>إدارة ملف الصيدلية والاشتراكات</Text>
                </View>

                <View style={{ width: 36 }} />
              </View>

              <ScrollView
                style={styles.scrollBody}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                bounces={true}
              >
                {/* 1. Executive Profile Hero Card */}
                <LinearGradient
                  colors={['#25044A', '#3F0082', '#5610A3']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.profileHeroCard}
                >
                  {/* Background Ambient Glow */}
                  <View style={styles.heroGlowCircle} />

                  <View style={styles.profileHeroContent}>
                    {/* Avatar with Glow Border */}
                    <View style={styles.avatarWrapper}>
                      {user?.photo ? (
                        <Image source={{ uri: user.photo }} style={styles.avatarImg} />
                      ) : (
                        <LinearGradient
                          colors={['#7C3AED', '#4C1D95']}
                          style={styles.avatarPlaceholder}
                        >
                          <Text style={styles.avatarLetter}>
                            {user?.name ? user.name.charAt(0).toUpperCase() : 'ص'}
                          </Text>
                        </LinearGradient>
                      )}

                      {/* Provider / Verified Badge */}
                      <View style={styles.providerBadge}>
                        {user?.provider === 'google' ? (
                          <FontAwesome name="google" size={13} color="#EA4335" />
                        ) : user?.provider === 'apple' ? (
                          <Ionicons name="logo-apple" size={13} color="#000000" />
                        ) : (
                          <Ionicons name="shield-checkmark" size={13} color="#10B981" />
                        )}
                      </View>
                    </View>

                    {/* Name & Details */}
                    <View style={styles.profileTextWrapper}>
                      <View style={styles.nameRow}>
                        <Text style={styles.profileName} numberOfLines={1}>
                          {user?.name || 'دكتور صيدلي'}
                        </Text>
                        <View style={styles.verifiedPill}>
                          <Ionicons name="checkmark-circle" size={12} color="#10B981" />
                          <Text style={styles.verifiedPillText}>موثق</Text>
                        </View>
                      </View>

                      <Text style={styles.profileEmail} numberOfLines={1}>
                        {user?.email || 'حساب مفعل في شبكة XPharma'}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>

                {/* 1.5. Current Subscription Plan Card - توضيح باقة الاشتراك في الملف الشخصي */}
                <View style={styles.subscriptionCard}>
                  <LinearGradient
                    colors={['#17062E', '#2A084E', '#3D0D70']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.subscriptionGradient}
                  >
                    {/* Top row: Active status badge + Tag */}
                    <View style={styles.subCardTopRow}>
                      <View style={styles.subActiveBadge}>
                        <Text style={styles.subActiveBadgeText}>
                          {isSubscribed ? 'اشتراك نشط ومفعل' : 'باقة مجانية مفتوحة'}
                        </Text>
                      </View>

                      <View style={styles.subPlanPill}>
                        <Ionicons name="sparkles" size={13} color="#FBBF24" />
                        <Text style={styles.subPlanPillText}>باقتك الحالية</Text>
                      </View>
                    </View>

                    {/* Plan Title & Badge Icon */}
                    <View style={styles.subMainRow}>
                      <View style={styles.subTextGroup}>
                        <Text style={styles.subPlanBigTitle}>{planLabel}</Text>
                        <Text style={styles.subPlanSubText}>{planSubtitle}</Text>
                      </View>
                      <View style={styles.subIconWrapper}>
                        <Ionicons name="ribbon-outline" size={26} color="#A78BFA" />
                      </View>
                    </View>

                    {/* Metrics: Remaining Days, Per Warehouse Quota, & Open Warehouses */}
                    <View style={styles.subMetricsRow}>
                      <View style={styles.subMetricCol}>
                        <Text style={styles.subMetricVal}>{isSubscribed ? `${daysRemaining} يوم` : 'دائم'}</Text>
                        <Text style={styles.subMetricLbl}>صلاحية الباقة</Text>
                      </View>
                      <View style={styles.subMetricSep} />
                      <View style={styles.subMetricCol}>
                        <Text style={styles.subMetricVal}>حتى {allowedPharmacies} صيدليات</Text>
                        <Text style={styles.subMetricLbl}>لكل مخزن على حدة</Text>
                      </View>
                      <View style={styles.subMetricSep} />
                      <View style={styles.subMetricCol}>
                        <Text style={styles.subMetricVal}>مفتوحة 100%</Text>
                        <Text style={styles.subMetricLbl}>كافة المخازن</Text>
                      </View>
                    </View>

                    {/* Upgrade / Change Plan Button */}
                    <TouchableOpacity
                      style={styles.subUpgradeBtn}
                      onPress={() => {
                        onClose();
                        onOpenSubscriptionModal();
                      }}
                      activeOpacity={0.85}
                    >
                      <LinearGradient
                        colors={['#7C3AED', '#5B21B6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.subUpgradeBtnGradient}
                      >
                        <Ionicons name="arrow-up-circle-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.subUpgradeBtnText}>ترقية أو تغيير الباقة</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </LinearGradient>
                </View>

                {/* 2. Settings Group 1: Features & System Actions */}
                <Text style={styles.sectionHeaderLabel}>الخدمات وتحديثات النظام</Text>
                <View style={styles.groupedCard}>
                  {/* OTA Updates Row */}
                  <TouchableOpacity
                    style={styles.menuRowItem}
                    onPress={checkForUpdates}
                    disabled={checkingUpdate}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-back" size={17} color="#9CA3AF" />

                    <View style={styles.menuRowDetails}>
                      <Text style={styles.menuRowTitle}>
                        {checkingUpdate ? 'جاري فحص التحديثات...' : 'تحديثات النظام الفورية (OTA)'}
                      </Text>
                      <Text style={styles.menuRowSubtitle}>
                        تنزيل وتطبيق أحدث ميزات التطبيق بدون متجر
                      </Text>
                    </View>

                    <View style={[styles.menuIconBox, { backgroundColor: '#EDE9FE' }]}>
                      {checkingUpdate ? (
                        <ActivityIndicator size="small" color="#6D28D9" />
                      ) : (
                        <Ionicons name="cloud-download" size={19} color="#6D28D9" />
                      )}
                    </View>
                  </TouchableOpacity>

                  <View style={styles.menuDivider} />

                  {/* Customer Support via WhatsApp */}
                  <TouchableOpacity
                    style={styles.menuRowItem}
                    onPress={handleSupportPress}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="chevron-back" size={17} color="#9CA3AF" />

                    <View style={styles.menuRowDetails}>
                      <Text style={styles.menuRowTitle}>الدعم الفني المباشر</Text>
                      <Text style={styles.menuRowSubtitle}>تواصل سريع مع خدمة عملاء XPharma عبر واتساب</Text>
                    </View>

                    <View style={[styles.menuIconBox, { backgroundColor: '#DCFCE7' }]}>
                      <Ionicons name="logo-whatsapp" size={19} color="#16A34A" />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.menuDivider} />

                  {/* Security & Encryption Row */}
                  <View style={styles.menuRowItem}>
                    <View style={styles.securityPill}>
                      <Ionicons name="lock-closed" size={12} color="#059669" />
                      <Text style={styles.securityPillText}>256-bit SSL</Text>
                    </View>

                    <View style={styles.menuRowDetails}>
                      <Text style={styles.menuRowTitle}>الأمان وحماية البيانات</Text>
                      <Text style={styles.menuRowSubtitle}>اتصال ومزامنة مشفرة بالكامل مع الخوادم</Text>
                    </View>

                    <View style={[styles.menuIconBox, { backgroundColor: '#E0F2FE' }]}>
                      <Ionicons name="shield-checkmark" size={19} color="#0284C7" />
                    </View>
                  </View>
                </View>

                {/* 4. App Info & Version Section */}
                <Text style={styles.sectionHeaderLabel}>عن التطبيق والنظام</Text>
                <View style={styles.groupedCard}>
                  <View style={styles.infoRowItem}>
                    <View style={styles.versionBadge}>
                      <Text style={styles.versionBadgeText}>v1.0.0 (Build 6)</Text>
                    </View>
                    <Text style={styles.infoRowLabel}>إصدار التطبيق</Text>
                  </View>

                  <View style={styles.menuDivider} />

                  <View style={styles.infoRowItem}>
                    <View style={styles.serverStatusBadge}>
                      <View style={styles.serverStatusDot} />
                      <Text style={styles.serverStatusText}>سحابي متصل</Text>
                    </View>
                    <Text style={styles.infoRowLabel}>حالة خوادم XPharma Cloud</Text>
                  </View>
                </View>

                {/* 5. Modern Redesigned Logout Button */}
                <TouchableOpacity
                  style={styles.logoutBtn}
                  onPress={async () => {
                    onClose();
                    await onLogout();
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="log-out-outline" size={19} color="#DC2626" />
                  <Text style={styles.logoutBtnText}>تسجيل الخروج من الحساب</Text>
                </TouchableOpacity>

                  <View style={{ height: 20 }} />
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      <UpdateModal
        visible={modalVisible}
        status={modalStatus}
        errorMessage={errorMessage}
        onClose={closeUpdateModal}
        onDownload={downloadUpdate}
        onRestart={restartApp}
        onRetry={checkForUpdates}
      />
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 10, 30, 0.58)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: SCREEN_HEIGHT * 0.88,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 20,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  headerBar: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  headerTitleBox: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDF2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    width: '100%',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 24,
  },
  profileHeroCard: {
    borderRadius: 24,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#3F0082',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  heroGlowCircle: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  profileHeroContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarImg: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  avatarPlaceholder: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  providerBadge: {
    position: 'absolute',
    bottom: -1,
    left: -1,
    backgroundColor: '#FFFFFF',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  profileTextWrapper: {
    flex: 1,
    alignItems: 'flex-end',
  },
  nameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 17.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  verifiedPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  verifiedPillText: {
    color: '#34D399',
    fontSize: 10.5,
    fontWeight: '700',
  },
  profileEmail: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12.5,
    fontWeight: '500',
    textAlign: 'right',
  },
  subscriptionCard: {
    borderRadius: 22,
    overflow: 'hidden',
    marginTop: 14,
    marginBottom: 16,
    shadowColor: '#3F0082',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  subscriptionGradient: {
    padding: 18,
    borderRadius: 22,
  },
  subCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  subActiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  subActiveBadgeText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '800',
  },
  subPlanPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  subPlanPillText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '800',
  },
  subMainRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  subIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  subTextGroup: {
    flex: 1,
    alignItems: 'flex-end',
  },
  subPlanBigTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'right',
    marginBottom: 3,
  },
  subPlanSubText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'right',
    lineHeight: 18,
  },
  subMetricsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  subMetricCol: {
    flex: 1,
    alignItems: 'center',
  },
  subMetricVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  subMetricLbl: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  subMetricSep: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  subUpgradeBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 2,
  },
  subUpgradeBtnGradient: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    gap: 8,
  },
  subUpgradeBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  sectionHeaderLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
    marginBottom: 8,
    marginRight: 4,
  },
  groupedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  menuRowItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  menuIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowDetails: {
    flex: 1,
    alignItems: 'flex-end',
  },
  menuRowTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
  },
  menuRowSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'right',
    marginTop: 2,
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    width: '100%',
  },
  securityPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  securityPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  infoRowItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  infoRowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  versionBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  versionBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  serverStatusBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  serverStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  serverStatusText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },
  logoutBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.2,
    borderColor: '#FECACA',
    borderRadius: 16,
    paddingVertical: 13,
    marginTop: 2,
  },
  logoutBtnText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '800',
  },
});
