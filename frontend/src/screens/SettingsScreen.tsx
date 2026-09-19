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
import { SubscriptionStatus } from '@/services/subscription';

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

        {/* 2. VIP Subscription Status Card */}
        <TouchableOpacity
          style={styles.subscriptionCard}
          onPress={onOpenSubscriptionModal}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={
              subscriptionStatusInfo?.isSubscribed
                ? ['#0B2B1E', '#064E3B']
                : subscriptionStatusInfo?.isTrialExpired
                ? ['#360B12', '#7F1D1D']
                : ['#281702', '#78350F']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.subscriptionGradient}
          >
            <View style={styles.subIconBadge}>
              <Ionicons
                name={
                  subscriptionStatusInfo?.isSubscribed
                    ? 'sparkles'
                    : subscriptionStatusInfo?.isTrialExpired
                    ? 'alert-circle'
                    : 'time-outline'
                }
                size={22}
                color={
                  subscriptionStatusInfo?.isSubscribed
                    ? '#34D399'
                    : subscriptionStatusInfo?.isTrialExpired
                    ? '#F87171'
                    : '#FBBF24'
                }
              />
            </View>

            <View style={styles.subDetailsCol}>
              <View style={styles.subTitleRow}>
                <Text style={styles.subTitleText}>
                  {subscriptionStatusInfo?.isSubscribed
                    ? `باقة نشطة: ${subscriptionStatusInfo.subscribedPlan} صيدليات`
                    : subscriptionStatusInfo?.isTrialExpired
                    ? 'انتهت الفترة التجريبية'
                    : 'الفترة التجريبية المجانية'}
                </Text>
                <View
                  style={[
                    styles.subStatusBadge,
                    subscriptionStatusInfo?.isSubscribed
                      ? styles.badgeSuccess
                      : subscriptionStatusInfo?.isTrialExpired
                      ? styles.badgeDanger
                      : styles.badgeWarning,
                  ]}
                >
                  <Text style={styles.subStatusBadgeText}>
                    {subscriptionStatusInfo?.isSubscribed
                      ? 'نشط ⚡'
                      : subscriptionStatusInfo?.isTrialExpired
                      ? 'منتهي'
                      : `${subscriptionStatusInfo?.daysRemaining ?? 7} يوم`}
                  </Text>
                </View>
              </View>

              <Text style={styles.subSubtitleText}>
                {subscriptionStatusInfo?.isSubscribed
                  ? 'ربط غير محدود ومزامنة فورية لكافة المخازن'
                  : subscriptionStatusInfo?.isTrialExpired
                  ? 'قم بالترقية لمواصلة التمتع بالربط الذكي'
                  : 'اضغط هنا للاطلاع على خطط وترقية الاشتراك'}
              </Text>
            </View>

            <Ionicons name="chevron-back" size={18} color="rgba(255, 255, 255, 0.7)" />
          </LinearGradient>
        </TouchableOpacity>

        {/* 3. Settings Group 1: Features & System Actions */}
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
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  subscriptionGradient: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  subIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subDetailsCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 3,
  },
  subTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  subTitleText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  subStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
  },
  badgeWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
  },
  badgeDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
  },
  subStatusBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  subSubtitleText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
    textAlign: 'right',
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
