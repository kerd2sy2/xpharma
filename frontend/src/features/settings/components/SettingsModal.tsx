import React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { useOTAUpdates } from '../hooks/useOTAUpdates';
import { SubscriptionStatus } from '@/services/subscription';

const { width } = Dimensions.get('window');

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
  const { checkingUpdate, checkForUpdates } = useOTAUpdates();

  const colors = {
    bg: '#F9F7FD',
    card: '#FFFFFF',
    text: '#1A0A33',
    secondaryText: '#6B5E82',
    border: '#E9E3F3',
    primary: '#3f0082',
    primarySoft: '#3f008215',
    success: '#00d780',
    danger: '#EF4444',
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlayBottom}>
          <TouchableWithoutFeedback>
            <View style={[styles.bottomSheetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Drag Handle Indicator */}
              <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

              {/* Header Row */}
              <View style={styles.headerRow}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>الإعدادات والحساب</Text>
                <TouchableOpacity
                  style={[styles.closeIconBtnSheet, { borderColor: colors.border }]}
                  onPress={onClose}
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>
              </View>

              {/* Avatar */}
              <View style={styles.profileAvatarContainer}>
                {user?.photo ? (
                  <Image source={{ uri: user.photo }} style={styles.profileAvatarImg} />
                ) : (
                  <View style={[styles.profileAvatarPlaceholder, { backgroundColor: colors.primary }]}>
                    <Text style={styles.profileAvatarLetter}>
                      {user?.name ? user.name.charAt(0).toUpperCase() : 'ص'}
                    </Text>
                  </View>
                )}
                <View style={styles.profileBadgeIcon}>
                  {user?.provider === 'google' ? (
                    <FontAwesome name="google" size={14} color="#EA4335" />
                  ) : (
                    <Ionicons name="logo-apple" size={14} color="#000000" />
                  )}
                </View>
              </View>

              {/* User Info */}
              <Text style={[styles.profileName, { color: colors.text }]}>
                {user?.name || 'دكتور صيدلي'}
              </Text>
              <Text style={[styles.profileEmail, { color: colors.secondaryText }]}>
                {user?.email || 'حساب مفعل'}
              </Text>

              {/* Subscription & Trial Status Card */}
              <TouchableOpacity
                style={[styles.profileSubCard, { backgroundColor: colors.primarySoft, borderColor: colors.border }]}
                onPress={() => {
                  onClose();
                  onOpenSubscriptionModal();
                }}
                activeOpacity={0.8}
              >
                <View style={styles.profileSubRight}>
                  <View style={[styles.profileSubIconCircle, { backgroundColor: '#FFFFFF' }]}>
                    <Ionicons name="sparkles" size={18} color="#F59E0B" />
                  </View>
                  <View style={styles.profileSubTextCol}>
                    <Text style={[styles.profileSubTitle, { color: colors.primary }]}>
                      {subscriptionStatusInfo?.isSubscribed
                        ? `باقة نشطة: ${subscriptionStatusInfo.subscribedPlan} صيدليات`
                        : subscriptionStatusInfo?.isTrialExpired
                        ? 'انتهت الفترة التجريبية (7 أيام)'
                        : `الفترة التجريبية: صيدلية واحدة (${subscriptionStatusInfo?.daysRemaining ?? 7} أيام متبقية)`}
                    </Text>
                    <Text style={[styles.profileSubSubtitle, { color: colors.secondaryText }]}>
                      {subscriptionStatusInfo?.isSubscribed
                        ? 'اشتراك مفعل عبر كل المخازن'
                        : 'اضغط لعرض خطط وباقات الاشتراك الشهري'}
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-back" size={16} color={colors.primary} />
              </TouchableOpacity>

              <View style={[styles.profileDivider, { backgroundColor: colors.border }]} />

              {/* Check for OTA Updates Button */}
              <TouchableOpacity
                style={[
                  styles.profileUpdateBtn,
                  { backgroundColor: colors.bg, borderColor: colors.border },
                ]}
                onPress={checkForUpdates}
                disabled={checkingUpdate}
                activeOpacity={0.8}
              >
                <View style={styles.profileUpdateRight}>
                  <View style={styles.iconCircle}>
                    <Ionicons name="cloud-download-outline" size={19} color={colors.primary} />
                  </View>
                  <View style={{ alignItems: 'flex-end', flex: 1 }}>
                    <Text style={[styles.profileUpdateText, { color: colors.text }]}>
                      {checkingUpdate ? 'جاري فحص التحديثات الهوائية...' : 'البحث عن التحديثات الهوائية (OTA Updates)'}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.secondaryText, marginTop: 1 }}>
                      التحقق الفوري من التحديثات وتطبيقها بدون الحاجة لمتجر
                    </Text>
                  </View>
                </View>
                {checkingUpdate ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="chevron-back" size={16} color={colors.secondaryText} />
                )}
              </TouchableOpacity>

              {/* Security & Version Row */}
              <View style={styles.securityRow}>
                <View style={styles.profileSecurityRow}>
                  <Ionicons name="shield-checkmark" size={15} color={colors.success} />
                  <Text style={[styles.profileSecurityText, { color: colors.secondaryText }]}>
                    اتصال مشفر 100%
                  </Text>
                </View>
                <Text style={{ fontSize: 11, color: colors.secondaryText, fontWeight: '600' }}>
                  الإصدار 1.0.0
                </Text>
              </View>

              {/* Logout Button */}
              <TouchableOpacity
                style={[styles.profileLogoutBtn, { borderColor: colors.danger }]}
                onPress={async () => {
                  onClose();
                  await onLogout();
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                <Text style={[styles.profileLogoutText, { color: colors.danger }]}>
                  تسجيل خروج
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(26, 10, 51, 0.45)',
    justifyContent: 'flex-end',
  },
  bottomSheetCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    alignItems: 'center',
    width: '100%',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  closeIconBtnSheet: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarContainer: {
    position: 'relative',
    marginTop: 4,
    marginBottom: 8,
  },
  profileAvatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  profileAvatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarLetter: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  profileBadgeIcon: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  profileEmail: {
    fontSize: 13,
    textAlign: 'center',
  },
  profileSubCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 10,
    marginBottom: 2,
  },
  profileSubRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  profileSubIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  profileSubTextCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  profileSubTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  profileSubSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    textAlign: 'right',
    marginTop: 2,
  },
  profileDivider: {
    height: 1,
    width: '100%',
    marginVertical: 12,
  },
  profileUpdateBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  profileUpdateRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(63, 0, 130, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileUpdateText: {
    fontSize: 13,
    fontWeight: '700',
  },
  securityRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  profileSecurityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  profileSecurityText: {
    fontSize: 12,
    fontWeight: '500',
  },
  profileLogoutBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  profileLogoutText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
