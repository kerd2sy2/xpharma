import React from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SUPPORT_WHATSAPP_NUMBER } from '@/services/auth';

interface UnlinkedNoticeModalProps {
  visible: boolean;
  onClose: () => void;
  warehouseName?: string;
  pharmacyName?: string;
  message?: string;
  isSwitchBranch?: boolean;
  switchedToName?: string;
}

export default function UnlinkedNoticeModal({
  visible,
  onClose,
  warehouseName,
  pharmacyName,
  message,
  isSwitchBranch = false,
  switchedToName,
}: UnlinkedNoticeModalProps) {
  const handleContactSupport = async () => {
    const lines = [
      'السلام عليكم، استلمت إشعار فك ربط صيدلية على تطبيق XPharma وأرغب في الاستفسار.',
      warehouseName ? `• المخزن: ${warehouseName}` : '',
      pharmacyName ? `• الصيدلية: ${pharmacyName}` : '',
      'يرجى توضيح سبب فك الربط وكيفية إعادة التفعيل.',
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
        `يرجى التواصل عبر واتساب على الرقم: +${SUPPORT_WHATSAPP_NUMBER}`
      );
    }
  };

  const defaultMsg = isSwitchBranch
    ? `تم فك ربط صيدلية "${pharmacyName || 'الفرع'}" من قبل إدارة المنصة، وتم التحويل تلقائياً إلى فرعك الآخر "${switchedToName || 'الفرع البديل'}".`
    : 'تم إلغاء ربط صيدليتك في هذا المخزن من قبل إدارة المنصة.';

  const displayMessage = message || defaultMsg;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              {/* Drag Handle */}
              <View style={styles.handleContainer}>
                <View style={styles.handle} />
              </View>

              {/* Icon Banner */}
              <View style={styles.iconWrapper}>
                <LinearGradient
                  colors={isSwitchBranch ? ['#F0FDF4', '#DCFCE7'] : ['#FEF2F2', '#FEE2E2']}
                  style={styles.iconCircle}
                >
                  <Ionicons
                    name={isSwitchBranch ? 'swap-horizontal' : 'alert-circle'}
                    size={38}
                    color={isSwitchBranch ? '#16A34A' : '#DC2626'}
                  />
                </LinearGradient>
              </View>

              {/* Title & Tag */}
              <View style={styles.textContainer}>
                <Text style={styles.title}>
                  {isSwitchBranch ? 'تحديث الفروع المربوطة' : 'تنبيه فك الارتباط'}
                </Text>

                {warehouseName && (
                  <View style={styles.warehousePill}>
                    <Ionicons name="business" size={13} color="#6D28D9" />
                    <Text style={styles.warehousePillText}>{warehouseName}</Text>
                  </View>
                )}
              </View>

              {/* Main Message Card */}
              <View style={[styles.messageCard, isSwitchBranch ? styles.messageCardSuccess : styles.messageCardDanger]}>
                <Ionicons
                  name={isSwitchBranch ? 'information-circle' : 'warning'}
                  size={20}
                  color={isSwitchBranch ? '#15803D' : '#B91C1C'}
                  style={styles.cardIcon}
                />
                <Text style={[styles.messageText, isSwitchBranch ? styles.messageTextSuccess : styles.messageTextDanger]}>
                  {displayMessage}
                </Text>
              </View>

              {/* Helpful Explanation */}
              <Text style={styles.subExplanation}>
                {isSwitchBranch
                  ? 'يمكنك الآن متابعة فواتيرك وحركات حسابك للفرع النشط مباشرة عبر التطبيق.'
                  : 'إذا كنت تعتقد أن هذا الإجراء تم بالخطأ أو ترغب في إعادة الربط، يرجى مراجعة إدارة المستودع أو التواصل مع الدعم الفني.'}
              </Text>

              {/* Action Buttons */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>
                    {isSwitchBranch ? 'متابعة التصفح' : 'العودة لقائمة المخازن'}
                  </Text>
                  <Ionicons
                    name={isSwitchBranch ? 'checkmark-circle-outline' : 'arrow-forward'}
                    size={19}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>

                {!isSwitchBranch && (
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={handleContactSupport}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="logo-whatsapp" size={18} color="#15803D" />
                    <Text style={styles.secondaryBtnText}>مراسلة الدعم الفني</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 5, 29, 0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 38 : 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 24,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 8,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  iconWrapper: {
    alignItems: 'center',
    marginBottom: 14,
    marginTop: 4,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  textContainer: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1A0A33',
    textAlign: 'center',
  },
  warehousePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(109, 40, 217, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(109, 40, 217, 0.15)',
  },
  warehousePillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#6D28D9',
  },
  messageCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  messageCardDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  messageCardSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  cardIcon: {
    flexShrink: 0,
  },
  messageText: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'right',
  },
  messageTextDanger: {
    color: '#991B1B',
  },
  messageTextSuccess: {
    color: '#166534',
  },
  subExplanation: {
    fontSize: 12.5,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 22,
    paddingHorizontal: 10,
  },
  actionsContainer: {
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: '#3f0082',
    height: 52,
    borderRadius: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '700',
  },
  secondaryBtn: {
    height: 48,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtnText: {
    color: '#15803D',
    fontSize: 14,
    fontWeight: '700',
  },
});
