import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Image,
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
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useOTAUpdates } from '@/features/settings/hooks/useOTAUpdates';
import UpdateModal from '@/components/UpdateModal';
import { SubscriptionStatus, PRICING_PLANS } from '@/services/subscription';

interface SettingsScreenProps {
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
  onBack: () => void;
}

export default function SettingsScreen({
  user,
  subscriptionStatusInfo,
  onOpenSubscriptionModal,
  onLogout,
  onBack,
}: SettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0);

  const currentPlanNumber = subscriptionStatusInfo?.subscribedPlan && subscriptionStatusInfo.subscribedPlan > 0
    ? subscriptionStatusInfo.subscribedPlan
    : 3;

  const isSubscribed = !!subscriptionStatusInfo?.isSubscribed && currentPlanNumber > 0;
  const matchedPlan = PRICING_PLANS.find((p) => p.pharmacies === currentPlanNumber);
  const planLabel = isSubscribed
    ? (matchedPlan ? matchedPlan.label : `باقة ${currentPlanNumber} صيدليات`)
    : 'الباقة المجانية (مخازن مفتوحة)';
  const planSubtitle = isSubscribed
    ? `حتى ${currentPlanNumber} صيدليات في المخزن الواحد، ومتاح فتح كل المخازن مجاناً`
    : 'صيدلية واحدة في كل مخزن مجاناً (متاح فتح وربط كافة المخازن)';
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

  // Handle Android hardware back button
  useEffect(() => {
    const onBackPress = () => {
      onBack();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [onBack]);

  const handleSupportPress = () => {
    Linking.openURL('https://wa.me/201019688000').catch(() => {
      // Fallback
    });
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" translucent={false} />

      {/* Top Header: Simple back arrow on right, Title in center, clean spacer on left */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backBtnClean}
          onPress={onBack}
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-forward" size={24} color="#1E1B4B" />
        </TouchableOpacity>
        <Text style={styles.topHeaderTitle} numberOfLines={1}>
          الحساب والإعدادات
        </Text>
        <View style={styles.topHeaderSpacer} />
      </View>

      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
        showsVerticalScrollIndicator={false}
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
                  <FontAwesome name="google" size={12} color="#EA4335" />
                ) : user?.provider === 'apple' ? (
                  <Ionicons name="logo-apple" size={12} color="#000000" />
                ) : (
                  <Ionicons name="shield-checkmark" size={12} color="#10B981" />
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

            {/* Metrics: Remaining Days & Pharmacy Count */}
            <View style={styles.subMetricsRow}>
              <View style={styles.subMetricCol}>
                <Text style={styles.subMetricVal}>{daysRemaining} يوم</Text>
                <Text style={styles.subMetricLbl}>المدة المتبقية</Text>
              </View>
              <View style={styles.subMetricSep} />
              <View style={styles.subMetricCol}>
                <Text style={styles.subMetricVal}>{linkedCount} / {allowedPharmacies}</Text>
                <Text style={styles.subMetricLbl}>الصيدليات المربوطة</Text>
              </View>
            </View>

            {/* Upgrade / Change Plan Button */}
            <TouchableOpacity
              style={styles.subUpgradeBtn}
              onPress={onOpenSubscriptionModal}
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
              <Text style={styles.versionBadgeText}>v1.0.1 (Build 6)</Text>
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
          onPress={onLogout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={19} color="#DC2626" />
          <Text style={styles.logoutBtnText}>تسجيل الخروج من الحساب</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* OTA Update Modal */}
      <UpdateModal
        visible={modalVisible}
        status={modalStatus}
        errorMessage={errorMessage}
        onClose={closeUpdateModal}
        onDownload={downloadUpdate}
        onRestart={restartApp}
        onRetry={checkForUpdates}
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
  topHeaderSpacer: {
    width: 36,
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
  },
  profileHeroCard: {
    borderRadius: 24,
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#3F0082',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  heroGlowCircle: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  profileHeroContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 16,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarImg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  avatarLetter: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  providerBadge: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
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
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'right',
  },
  verifiedPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
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
    fontSize: 12.5,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
  },
  subscriptionCard: {
    borderRadius: 22,
    overflow: 'hidden',
    marginTop: 14,
    marginBottom: 8,
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
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
    marginTop: 4,
    paddingHorizontal: 4,
  },
  groupedCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  menuRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuRowDetails: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  menuRowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'right',
  },
  menuRowSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'right',
  },
  menuIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 16,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  infoRowLabel: {
    fontSize: 13.5,
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
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  serverStatusBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
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
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  logoutBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 4,
  },
  logoutBtnText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
  },
});
