import React from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

export type NoticeType = 'success' | 'warning' | 'info' | 'error' | 'confirm';

export interface SubscriptionNoticeModalProps {
  visible: boolean;
  type: NoticeType;
  title: string;
  message: string;
  badgeText?: string;
  primaryButtonText?: string;
  onPrimaryPress?: () => void;
  secondaryButtonText?: string;
  onSecondaryPress?: () => void;
  onClose: () => void;
}

export default function SubscriptionNoticeModal({
  visible,
  type,
  title,
  message,
  badgeText,
  primaryButtonText = 'حسناً',
  onPrimaryPress,
  secondaryButtonText,
  onSecondaryPress,
  onClose,
}: SubscriptionNoticeModalProps) {
  if (!visible) return null;

  const getTheme = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'checkmark-circle' as const,
          iconColor: '#10B981',
          iconBg: '#ECFDF5',
          iconBorder: '#A7F3D0',
          badgeBg: '#D1FAE5',
          badgeText: '#065F46',
          primaryBtnBg: '#10B981',
        };
      case 'warning':
        return {
          icon: 'alert-circle' as const,
          iconColor: '#F59E0B',
          iconBg: '#FFFBEB',
          iconBorder: '#FDE68A',
          badgeBg: '#FEF3C7',
          badgeText: '#92400E',
          primaryBtnBg: '#F59E0B',
        };
      case 'error':
        return {
          icon: 'close-circle' as const,
          iconColor: '#EF4444',
          iconBg: '#FEF2F2',
          iconBorder: '#FECACA',
          badgeBg: '#FEE2E2',
          badgeText: '#991B1B',
          primaryBtnBg: '#EF4444',
        };
      case 'confirm':
        return {
          icon: 'help-circle' as const,
          iconColor: '#3F0082',
          iconBg: '#F3E8FF',
          iconBorder: '#DDD6FE',
          badgeBg: '#EDE9FE',
          badgeText: '#5B21B6',
          primaryBtnBg: '#3F0082',
        };
      case 'info':
      default:
        return {
          icon: 'information-circle' as const,
          iconColor: '#3F0082',
          iconBg: '#F3E8FF',
          iconBorder: '#DDD6FE',
          badgeBg: '#EDE9FE',
          badgeText: '#5B21B6',
          primaryBtnBg: '#3F0082',
        };
    }
  };

  const theme = getTheme();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.dialogCard}>
              {/* Drag Handle */}
              <View style={styles.sheetHandle} />

              {/* Close Button */}
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={19} color="#64748B" />
              </TouchableOpacity>

              {/* Icon Circle */}
              <View
                style={[
                  styles.iconCircle,
                  {
                    backgroundColor: theme.iconBg,
                    borderColor: theme.iconBorder,
                  },
                ]}
              >
                <Ionicons name={theme.icon} size={36} color={theme.iconColor} />
              </View>

              {/* Optional Badge */}
              {badgeText ? (
                <View style={[styles.badgePill, { backgroundColor: theme.badgeBg }]}>
                  <Text style={[styles.badgePillText, { color: theme.badgeText }]}>
                    {badgeText}
                  </Text>
                </View>
              ) : null}

              {/* Title */}
              <Text style={styles.titleText}>{title}</Text>

              {/* Message */}
              <Text style={styles.messageText}>{message}</Text>

              {/* Actions */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: theme.primaryBtnBg }]}
                  onPress={onPrimaryPress || onClose}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryButtonText}>{primaryButtonText}</Text>
                </TouchableOpacity>

                {secondaryButtonText && onSecondaryPress ? (
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={onSecondaryPress}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.secondaryButtonText}>{secondaryButtonText}</Text>
                  </TouchableOpacity>
                ) : null}
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
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    zIndex: 9999,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 38 : 28,
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 16,
  },
  sheetHandle: {
    width: 40,
    height: 4.5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    left: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  badgePill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  badgePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  titleText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  messageText: {
    fontSize: 13.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  actionsContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 8,
  },
  primaryButton: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 13.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  secondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#64748B',
    fontSize: 13.5,
    fontWeight: '600',
  },
});
