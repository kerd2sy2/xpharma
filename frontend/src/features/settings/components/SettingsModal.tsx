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
import { SubscriptionStatus, PRICING_PLANS } from '@/features/subscription';

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

  const handleSupportPress = () => {
    Linking.openURL('https://wa.me/201550888841').catch(() => {
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
                  <TouchableOpacity
                    style={styles.subUpgradeBtn}
                    onPress={() => {
                      onClose();
                      onOpenSubscriptionModal();
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="sparkles" size={15} color="#4338CA" />
                    <Text style={styles.subUpgradeBtnText}>ترقية أو إدارة الباقة</Text>
                    <Ionicons name="chevron-back" size={15} color="#4338CA" />
                  </TouchableOpacity>
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
    marginBottom: 14,
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
    marginBottom: 14,
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
