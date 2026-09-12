import React from 'react';
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
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SUPPORT_WHATSAPP_NUMBER } from '@/services/auth';

const { width } = Dimensions.get('window');

interface DeviceMismatchModalProps {
  visible: boolean;
  onClose: () => void;
  registeredDevice?: string;
  currentDevice?: string;
  email?: string;
  errorMessage?: string;
  onLogout?: () => void;
}

export default function DeviceMismatchModal({
  visible,
  onClose,
  registeredDevice,
  currentDevice,
  email,
  errorMessage,
  onLogout,
}: DeviceMismatchModalProps) {
  const handleContactSupport = async () => {
    const lines = [
      'السلام عليكم، أحتاج مساعدة في نقل وتفعيل حسابي على XPharma إلى هاتف جديد.',
      email ? `• البريد الإلكتروني: ${email}` : '',
      registeredDevice ? `• الهاتف السابق المسجل: ${registeredDevice}` : '',
      currentDevice ? `• الهاتف الجديد: ${currentDevice}` : '',
      'برجاء فك الارتباط للجهاز السابق لنقل الحساب إلى الهاتف الجديد.',
    ].filter(Boolean);

    const text = encodeURIComponent(lines.join('\n'));
    const whatsappUrl = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${text}`;

    try {
      const supported = await Linking.canOpenURL(whatsappUrl);
      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Linking.openURL(`https://api.whatsapp.com/send?text=${text}`);
      }
    } catch {
      Alert.alert(
        'الدعم الفني',
        `يرجى مراسلة الدعم الفني عبر واتساب على الرقم: +${SUPPORT_WHATSAPP_NUMBER} لمساعدتك في تغيير الهاتف وتفعيل الحساب.`
      );
    }
  };

  const handleLogoutAction = () => {
    if (onLogout) {
      onLogout();
    }
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        // Prevent dismissal without conscious choice
      }}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          {/* Header Gradient Accent */}
          <LinearGradient
            colors={['#DC2626', '#991B1B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerBanner}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name="cellphone-lock" size={34} color="#FFFFFF" />
            </View>
            <Text style={styles.headerTitle}>الحساب مفعل على هاتف آخر</Text>
            <Text style={styles.headerSubtitle}>تنبيه أمان وتعدد الأجهزة</Text>
          </LinearGradient>

          <ScrollView 
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}>
            {/* Primary Message */}
            <View style={styles.alertBox}>
              <Ionicons name="alert-circle" size={20} color="#DC2626" style={styles.alertIcon} />
              <Text style={styles.alertMessage}>
                {errorMessage ||
                  'هذا الحساب مسجل ومفعل بالفعل على هاتف آخر. لا يمكن فتح الحساب على أكثر من جهاز في نفس الوقت.'}
              </Text>
            </View>

            {/* Device Info Badges */}
            <View style={styles.deviceDetailsCard}>
              <View style={styles.deviceRow}>
                <View style={styles.deviceBadgeIconInactive}>
                  <MaterialCommunityIcons name="cellphone" size={18} color="#DC2626" />
                </View>
                <View style={styles.deviceTextCol}>
                  <Text style={styles.deviceLabel}>الجهاز المسجل حالياً في النظام:</Text>
                  <Text style={styles.deviceValueRegistered}>
                    {registeredDevice || 'هاتف مسجل مسبقاً'}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.deviceRow}>
                <View style={styles.deviceBadgeIconActive}>
                  <MaterialCommunityIcons name="cellphone-arrow-down" size={18} color="#2563EB" />
                </View>
                <View style={styles.deviceTextCol}>
                  <Text style={styles.deviceLabel}>هذا الجهاز الحالي:</Text>
                  <Text style={styles.deviceValueCurrent}>
                    {currentDevice || (Platform.OS === 'ios' ? 'iPhone' : 'Android')}
                  </Text>
                </View>
              </View>

              {email ? (
                <>
                  <View style={styles.divider} />
                  <View style={styles.deviceRow}>
                    <View style={styles.deviceBadgeIconEmail}>
                      <Ionicons name="mail" size={16} color="#7C3AED" />
                    </View>
                    <View style={styles.deviceTextCol}>
                      <Text style={styles.deviceLabel}>البريد الإلكتروني المربوط:</Text>
                      <Text style={styles.deviceEmailText}>{email}</Text>
                    </View>
                  </View>
                </>
              ) : null}
            </View>

            {/* Explanation Guide */}
            <View style={styles.helpGuideCard}>
              <Ionicons name="information-circle-outline" size={20} color="#0D9488" style={{ marginTop: 2 }} />
              <Text style={styles.helpGuideText}>
                إذا كان هاتفك السابق به مشكلة أو قمت بتغيير الهاتف وتريد نقل وتفعيل الحساب على هذا الهاتف، تواصل مع فريق الدعم الفني لفك ربط الجهاز السابق وتمكينك من الدخول فوراً.
              </Text>
            </View>

            {/* Action Buttons */}
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.whatsappButton}
              onPress={handleContactSupport}>
              <LinearGradient
                colors={['#25D366', '#128C7E']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.whatsappGradient}>
                <Ionicons name="logo-whatsapp" size={24} color="#FFFFFF" />
                <View style={styles.whatsappBtnTextCol}>
                  <Text style={styles.whatsappButtonText}>تواصل مع الدعم الفني لتغيير الهاتف</Text>
                  <Text style={styles.whatsappSubText}>فك ربط الجهاز وتفعيل هذا الهاتف فوراً</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.logoutButton}
              onPress={handleLogoutAction}>
              <Ionicons name="log-out-outline" size={18} color="#64748B" />
              <Text style={styles.logoutButtonText}>تسجيل الخروج أو استخدام حساب آخر</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: Math.min(width - 32, 420),
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 20,
  },
  headerBanner: {
    paddingTop: 26,
    paddingBottom: 22,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  contentContainer: {
    padding: 20,
    gap: 16,
  },
  alertBox: {
    flexDirection: 'row-reverse',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    padding: 14,
    alignItems: 'flex-start',
    gap: 10,
  },
  alertIcon: {
    marginTop: 2,
  },
  alertMessage: {
    flex: 1,
    color: '#991B1B',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 20,
    textAlign: 'right',
  },
  deviceDetailsCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  deviceRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  deviceBadgeIconInactive: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceBadgeIconActive: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceBadgeIconEmail: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceTextCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  deviceLabel: {
    color: '#64748B',
    fontSize: 11.5,
    fontWeight: '500',
  },
  deviceValueRegistered: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  deviceValueCurrent: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  deviceEmailText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 2,
  },
  helpGuideCard: {
    flexDirection: 'row-reverse',
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    alignItems: 'flex-start',
  },
  helpGuideText: {
    flex: 1,
    color: '#0F766E',
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'right',
  },
  whatsappButton: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
    marginTop: 4,
  },
  whatsappGradient: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  whatsappBtnTextCol: {
    alignItems: 'center',
  },
  whatsappButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  whatsappSubText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  logoutButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    gap: 8,
  },
  logoutButtonText: {
    color: '#475569',
    fontSize: 13.5,
    fontWeight: '600',
  },
});
