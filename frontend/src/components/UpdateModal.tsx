import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
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

const { width } = Dimensions.get('window');

export type UpdateModalStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'up_to_date'
  | 'error'
  | 'dev_mode';

interface UpdateModalProps {
  visible: boolean;
  status: UpdateModalStatus;
  errorMessage?: string;
  onClose: () => void;
  onDownload: () => void;
  onRestart: () => void;
  onRetry: () => void;
}

export default function UpdateModal({
  visible,
  status,
  errorMessage,
  onClose,
  onDownload,
  onRestart,
  onRetry,
}: UpdateModalProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status === 'checking' || status === 'downloading') {
      // Pulsing glow animation
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.12,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [status, pulseAnim]);

  if (!visible || status === 'idle') {
    return null;
  }

  const renderContent = () => {
    switch (status) {
      case 'checking':
        return (
          <View style={styles.stateWrapper}>
            <View style={styles.radarContainer}>
              <Animated.View style={[styles.radarWave, { transform: [{ scale: pulseAnim }] }]} />
              <View style={[styles.iconCircle, { backgroundColor: '#EDE9FE', borderColor: '#C4B5FD' }]}>
                <Ionicons name="cloud-download-outline" size={36} color="#6D28D9" />
              </View>
            </View>

            <Text style={styles.modalTitle}>جاري البحث عن تحديثات...</Text>
            <Text style={styles.modalSubtitle}>
              يتم الآن الاتصال بسحابة XPharma للتأكد من وجود أحدث الإصدارات والميزات لنظامك.
            </Text>

            <View style={styles.loadingBarWrapper}>
              <ActivityIndicator size="small" color="#6D28D9" />
              <Text style={styles.loadingBarText}>يرجى الانتظار لحظات...</Text>
            </View>
          </View>
        );

      case 'available':
        return (
          <View style={styles.stateWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: '#EDE9FE', borderColor: '#DDD6FE' }]}>
              <Ionicons name="rocket-outline" size={38} color="#6D28D9" />
            </View>

            <View style={styles.badgeRow}>
              <View style={styles.versionBadge}>
                <Text style={styles.versionBadgeText}>إصدار فوري جديد ⚡</Text>
              </View>
            </View>

            <Text style={styles.modalTitle}>تحديث جديد متاح للنظام</Text>
            <Text style={styles.modalSubtitle}>
              يتوفر الآن تحديث هوائي جديد يحتوي على تحسينات هامة في الأداء وسرعة المعالجة واستقرار الاتصال.
            </Text>

            <View style={styles.featuresCard}>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.featureText}>تحسينات فورية في سرعة التنقل والبحث</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.featureText}>معالجة واستقرار أعلى لربط المخازن والطلبات</Text>
              </View>
              <View style={styles.featureItem}>
                <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                <Text style={styles.featureText}>ترقيات الأمان ودعم الميزات الجديدة</Text>
              </View>
            </View>

            <TouchableOpacity activeOpacity={0.88} style={styles.primaryButton} onPress={onDownload}>
              <LinearGradient
                colors={['#4F46E5', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btnGradient}
              >
                <Ionicons name="download-outline" size={20} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>تنزيل وتحديث الآن</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>تحديث لاحقاً</Text>
            </TouchableOpacity>
          </View>
        );

      case 'downloading':
        return (
          <View style={styles.stateWrapper}>
            <View style={styles.radarContainer}>
              <Animated.View style={[styles.radarWave, { transform: [{ scale: pulseAnim }], borderColor: '#A78BFA' }]} />
              <View style={[styles.iconCircle, { backgroundColor: '#EDE9FE', borderColor: '#C4B5FD' }]}>
                <ActivityIndicator size="large" color="#6D28D9" />
              </View>
            </View>

            <Text style={styles.modalTitle}>جاري تنزيل التحديث...</Text>
            <Text style={styles.modalSubtitle}>
              يتم الآن تحميل أحدث ملفات النظام وتجهيزها للتثبيت. لن يستغرق الأمر سوى ثوانٍ معدودة.
            </Text>

            <View style={styles.progressContainer}>
              <View style={styles.progressBarTrack}>
                <Animated.View style={[styles.progressBarFill, { width: '85%' }]} />
              </View>
              <Text style={styles.progressNote}>يرجى عدم إغلاق التطبيق أثناء التنزيل</Text>
            </View>
          </View>
        );

      case 'ready':
        return (
          <View style={styles.stateWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }]}>
              <Ionicons name="checkmark-done-circle" size={42} color="#059669" />
            </View>

            <View style={styles.badgeRow}>
              <View style={[styles.versionBadge, { backgroundColor: '#DCFCE7' }]}>
                <Text style={[styles.versionBadgeText, { color: '#059669' }]}>تم التنزيل بنجاح ✅</Text>
              </View>
            </View>

            <Text style={styles.modalTitle}>التحديث جاهز للتطبيق</Text>
            <Text style={styles.modalSubtitle}>
              تم تجهيز جميع ملفات التحديث بنجاح. أعد تشغيل التطبيق الآن لتطبيق التغييرات والاستمتاع بالميزات الجديدة.
            </Text>

            <TouchableOpacity activeOpacity={0.88} style={styles.primaryButton} onPress={onRestart}>
              <LinearGradient
                colors={['#059669', '#10B981']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btnGradient}
              >
                <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>إعادة التشغيل الآن</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        );

      case 'up_to_date':
        return (
          <View style={styles.stateWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
              <MaterialCommunityIcons name="shield-check" size={42} color="#16A34A" />
            </View>

            <View style={styles.badgeRow}>
              <View style={[styles.versionBadge, { backgroundColor: '#DCFCE7' }]}>
                <Text style={[styles.versionBadgeText, { color: '#15803D' }]}>أحدث إصدار ✅</Text>
              </View>
            </View>

            <Text style={styles.modalTitle}>تطبيقك محدث بالكامل</Text>
            <Text style={styles.modalSubtitle}>
              أنت تعمل حالياً بأحدث إصدار رسمي من نظام XPharma، وجميع الميزات والتحسينات مفعلة لديك.
            </Text>

            <TouchableOpacity activeOpacity={0.88} style={styles.primaryButton} onPress={onClose}>
              <LinearGradient
                colors={['#3F0082', '#6D28D9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btnGradient}
              >
                <Text style={styles.primaryButtonText}>ممتاز، استمرار</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        );

      case 'dev_mode':
        return (
          <View style={styles.stateWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
              <Ionicons name="code-slash" size={38} color="#D97706" />
            </View>

            <View style={styles.badgeRow}>
              <View style={[styles.versionBadge, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.versionBadgeText, { color: '#B45309' }]}>وضع المطور (Dev Mode)</Text>
              </View>
            </View>

            <Text style={styles.modalTitle}>بيئة التطوير المحلي</Text>
            <Text style={styles.modalSubtitle}>
              أنت تستخدم التطبيق في وضع التطوير المحلي (Development Mode). التحديثات الهوائية الفورية تعمل تلقائياً على النسخ المثبتة (Production / Preview).
            </Text>

            <TouchableOpacity activeOpacity={0.88} style={styles.primaryButton} onPress={onClose}>
              <LinearGradient
                colors={['#D97706', '#F59E0B']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btnGradient}
              >
                <Text style={styles.primaryButtonText}>فهمت ذلك</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        );

      case 'error':
        return (
          <View style={styles.stateWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF2F2', borderColor: '#FECDD3' }]}>
              <Ionicons name="alert-circle" size={40} color="#E11D48" />
            </View>

            <View style={styles.badgeRow}>
              <View style={[styles.versionBadge, { backgroundColor: '#FEE2E2' }]}>
                <Text style={[styles.versionBadgeText, { color: '#BE123C' }]}>تنبيه</Text>
              </View>
            </View>

            <Text style={styles.modalTitle}>تعذر فحص التحديثات</Text>
            <Text style={styles.modalSubtitle}>
              {errorMessage || 'يرجى التأكد من اتصالك بالإنترنت والمحاولة مجدداً.'}
            </Text>

            <TouchableOpacity activeOpacity={0.88} style={styles.primaryButton} onPress={onRetry}>
              <LinearGradient
                colors={['#4F46E5', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btnGradient}
              >
                <Ionicons name="refresh" size={18} color="#FFFFFF" />
                <Text style={styles.primaryButtonText}>إعادة المحاولة</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        );

      default:
        return null;
    }
  };

  const isDismissible =
    status !== 'downloading' && status !== 'checking';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (isDismissible) onClose();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.modalSheet}>
          <View style={styles.sheetHandle} />

          {isDismissible && (
            <TouchableOpacity style={styles.closeIconBtn} onPress={onClose} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color="#94A3B8" />
            </TouchableOpacity>
          )}

          <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
            {renderContent()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
    zIndex: 9999,
  },
  modalSheet: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 25,
    paddingTop: 8,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 6,
    marginBottom: 4,
  },
  closeIconBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    alignItems: 'center',
  },
  stateWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  radarContainer: {
    width: 84,
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 16,
    marginTop: 6,
  },
  radarWave: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: '#C4B5FD',
    backgroundColor: 'rgba(237, 233, 254, 0.4)',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    marginTop: 6,
  },
  badgeRow: {
    marginBottom: 8,
  },
  versionBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  versionBadgeText: {
    color: '#6D28D9',
    fontSize: 12,
    fontWeight: '700',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E1B4B',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 13.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 18,
    paddingHorizontal: 6,
  },
  featuresCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 10,
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'right',
  },
  primaryButton: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnGradient: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: '#64748B',
    fontSize: 13.5,
    fontWeight: '600',
  },
  loadingBarWrapper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 8,
  },
  loadingBarText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#EDE9FE',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#7C3AED',
    borderRadius: 4,
  },
  progressNote: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
});
