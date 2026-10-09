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
import { SubscriptionStatus, PRICING_PLANS } from '@/features/subscription';

interface SettingsScreenProps {
  user: {
    id?: string;
    name?: string;
    email?: string;
    photo?: string;
    provider?: string;
  } | null;
  subscriptionStatusInfo: SubscriptionStatus | null;
  onOpenSubscriptionModal?: () => void;
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
    : 'الباقة المجانية';
  const planSubtitle = isSubscribed
    ? `${currentPlanNumber} صيدليات لكل مخزن • كافة المخازن مفتوحة`
    : 'صيدلية واحدة لكل مخزن مجاناً';
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
    Linking.openURL('https://wa.me/201550888841').catch(() => {
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
        {/* 1. Clean Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarWrapper}>
            {user?.photo ? (
              <Image source={{ uri: user.photo }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarLetter}>
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'ص'}
                </Text>
              </View>
            )}

            <View style={styles.providerBadge}>
              {user?.provider === 'google' ? (
                <FontAwesome name="google" size={11} color="#EA4335" />
              ) : user?.provider === 'apple' ? (
                <Ionicons name="logo-apple" size={11} color="#000000" />
              ) : (
                <Ionicons name="shield-checkmark" size={11} color="#10B981" />
              )}
            </View>
          </View>

          <View style={styles.profileTextWrapper}>
            <View style={styles.nameRow}>
              <Text style={styles.profileName} numberOfLines={1}>
                {user?.name || 'دكتور صيدلي'}
              </Text>
              <View style={styles.verifiedPill}>
                <Ionicons name="checkmark-circle" size={11} color="#059669" />
                <Text style={styles.verifiedPillText}>موثق</Text>
              </View>
            </View>

            <Text style={styles.profileEmail} numberOfLines={1}>
              {user?.email || 'حساب مفعل في شبكة XPharma'}
            </Text>
          </View>
        </View>

        {/* 1.5. Current Subscription Plan Card */}
        <View style={styles.subCard}>
          {/* Top row: Section tag and Active/Free Status Badge */}
          <View style={styles.subCardHeader}>
            <View style={styles.subStatusBadge}>
              <View
                style={[
                  styles.subStatusDot,
                  { backgroundColor: isSubscribed ? '#10B981' : '#64748B' },
                ]}
              />
              <Text
                style={[
                  styles.subStatusText,
                  { color: isSubscribed ? '#047857' : '#475569' },
                ]}
              >
                {isSubscribed ? 'اشتراك نشط ومفعل' : 'الباقة المجانية'}
              </Text>
            </View>

            <View style={styles.subTagPill}>
              <Ionicons name="card-outline" size={13} color="#4F46E5" />
              <Text style={styles.subTagText}>باقتك الحالية</Text>
            </View>
          </View>

          {/* Plan Title & Subtitle */}
          <View style={styles.subBody}>
            <Text style={styles.subPlanTitle}>{planLabel}</Text>
            <Text style={styles.subPlanSubtitle}>{planSubtitle}</Text>
          </View>

          {/* Compact Clean Details Row */}
          <View style={styles.subMetaRow}>
            <View style={styles.subMetaItem}>
              <Ionicons name="storefront-outline" size={14} color="#4F46E5" />
              <Text style={styles.subMetaLabel}>الصيدليات:</Text>
              <Text style={styles.subMetaVal}>
                {allowedPharmacies === 1 ? '1 لكل مخزن' : `${allowedPharmacies} لكل مخزن`}
              </Text>
            </View>

            <View style={styles.subMetaDivider} />

            <View style={styles.subMetaItem}>
              <Ionicons name="time-outline" size={14} color="#4F46E5" />
              <Text style={styles.subMetaLabel}>الصلاحية:</Text>
              <Text style={styles.subMetaVal}>
                {isSubscribed ? `${daysRemaining} يوم` : 'دائم'}
              </Text>
            </View>
          </View>

          {/* Upgrade / Change Plan Action Button */}
          {onOpenSubscriptionModal && (
            <TouchableOpacity
              style={styles.subUpgradeBtn}
              onPress={onOpenSubscriptionModal}
              activeOpacity={0.8}
            >
              <Ionicons name="sparkles" size={15} color="#4338CA" />
              <Text style={styles.subUpgradeBtnText}>ترقية أو إدارة الباقة</Text>
              <Ionicons name="chevron-back" size={15} color="#4338CA" />
            </TouchableOpacity>
          )}
        </View>

        {/* 2. Settings Group 1: Features & System Actions */}
        <Text style={styles.sectionHeaderLabel}>الخدمات وتحديثات النظام</Text>
        <View style={styles.groupedCard}>
          {/* Updates Row */}
          <TouchableOpacity
            style={styles.menuRowItem}
            onPress={checkForUpdates}
            disabled={checkingUpdate}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={17} color="#9CA3AF" />

            <View style={styles.menuRowDetails}>
              <Text style={styles.menuRowTitle}>
                {checkingUpdate ? 'جاري فحص التحديثات...' : 'التحديثات'}
              </Text>
              <Text style={styles.menuRowSubtitle}>
                فحص وتثبيت أحدث ميزات التطبيق
              </Text>
            </View>

            <View style={[styles.menuIconBox, { backgroundColor: '#EDE9FE' }]}>
              {checkingUpdate ? (
                <ActivityIndicator size="small" color="#6D28D9" />
              ) : (
                <Ionicons name="cloud-download-outline" size={19} color="#6D28D9" />
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
        </View>

        {/* 3. Modern Redesigned Logout Button */}
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
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: '800',
    color: '#4F46E5',
  },
  providerBadge: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  profileTextWrapper: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  profileName: {
    fontSize: 16.5,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  verifiedPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  verifiedPillText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'right',
  },
  subCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    marginTop: 4,
    marginBottom: 4,
  },
  subCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  subStatusBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  subStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subStatusText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  subTagPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
  },
  subTagText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#4F46E5',
  },
  subBody: {
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  subPlanTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
    marginBottom: 4,
  },
  subPlanSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'right',
    lineHeight: 18,
  },
  subMetaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    marginBottom: 12,
  },
  subMetaItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  subMetaLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  subMetaVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  subMetaDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#E2E8F0',
  },
  subUpgradeBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 6,
  },
  subUpgradeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4338CA',
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
