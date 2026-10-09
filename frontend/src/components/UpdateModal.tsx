import React from 'react';
import {
  ActivityIndicator,
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
  if (!visible || status === 'idle') {
    return null;
  }

  const isDismissible = status !== 'downloading' && status !== 'checking';

  const renderContent = () => {
    switch (status) {
      case 'checking':
        return (
          <View style={styles.stateWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: '#EEF2FF' }]}>
              <ActivityIndicator size="small" color="#4F46E5" />
            </View>

            <Text style={styles.modalTitle}>جاري البحث عن تحديثات...</Text>
            <Text style={styles.modalSubtitle}>
              يتم الآن التحقق من وجود إصدارات وتحسينات جديدة للنظام.
            </Text>
          </View>
        );

      case 'available':
        return (
          <View style={styles.stateWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: '#EEF2FF' }]}>
              <Ionicons name="cloud-download-outline" size={30} color="#4F46E5" />
            </View>

            <View style={styles.badgeRow}>
              <View style={styles.versionBadge}>
                <Text style={styles.versionBadgeText}>إصدار جديد متوفر</Text>
              </View>
            </View>

            <Text style={styles.modalTitle}>تحديث جديد متاح</Text>
            <Text style={styles.modalSubtitle}>
              يتوفر إصدار جديد يتضمن تحسينات في الأداء وسرعة الاستجابة واستقرار النظام.
            </Text>

            <TouchableOpacity activeOpacity={0.85} style={styles.primaryButton} onPress={onDownload}>
              <Ionicons name="download-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>تنزيل وتحديث الآن</Text>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7} style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>لاحقاً</Text>
            </TouchableOpacity>
          </View>
        );

      case 'downloading':
        return (
          <View style={styles.stateWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: '#EEF2FF' }]}>
              <ActivityIndicator size="small" color="#4F46E5" />
            </View>

            <Text style={styles.modalTitle}>جاري تنزيل التحديث...</Text>
            <Text style={styles.modalSubtitle}>
              يتم تحميل الملفات وتجهيزها للتثبيت، يرجى الانتظار لحظات.
            </Text>

            <View style={styles.progressBarTrack}>
              <View style={styles.progressBarFill} />
            </View>
          </View>
        );

      case 'ready':
        return (
          <View style={styles.stateWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="checkmark-circle-outline" size={32} color="#059669" />
            </View>

            <View style={styles.badgeRow}>
              <View style={[styles.versionBadge, { backgroundColor: '#ECFDF5' }]}>
                <Text style={[styles.versionBadgeText, { color: '#059669' }]}>اكتمل التنزيل</Text>
              </View>
            </View>

            <Text style={styles.modalTitle}>التحديث جاهز للتطبيق</Text>
            <Text style={styles.modalSubtitle}>
              تم تجهيز ملفات التحديث بنجاح. يرجى إعادة تشغيل التطبيق لتطبيق التحسينات.
            </Text>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.primaryButton, { backgroundColor: '#059669' }]}
              onPress={onRestart}
            >
              <Ionicons name="refresh-outline" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>إعادة التشغيل الآن</Text>
            </TouchableOpacity>
          </View>
        );

      case 'up_to_date':
        return (
          <View style={styles.stateWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="checkmark-done-circle-outline" size={32} color="#059669" />
            </View>

            <View style={styles.badgeRow}>
              <View style={[styles.versionBadge, { backgroundColor: '#ECFDF5' }]}>
                <Text style={[styles.versionBadgeText, { color: '#059669' }]}>أحدث إصدار</Text>
              </View>
            </View>

            <Text style={styles.modalTitle}>أنت على أحدث إصدار</Text>
            <Text style={styles.modalSubtitle}>
              تطبيقك محدث بالكامل ولا توجد تحديثات معلقة حالياً.
            </Text>

            <TouchableOpacity activeOpacity={0.85} style={styles.primaryButton} onPress={onClose}>
              <Text style={styles.primaryButtonText}>حسناً</Text>
            </TouchableOpacity>
          </View>
        );

      case 'dev_mode':
        return (
          <View style={styles.stateWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="code-slash-outline" size={28} color="#D97706" />
            </View>

            <View style={styles.badgeRow}>
              <View style={[styles.versionBadge, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.versionBadgeText, { color: '#B45309' }]}>بيئة التطوير</Text>
              </View>
            </View>

            <Text style={styles.modalTitle}>وضع التطوير المحلي</Text>
            <Text style={styles.modalSubtitle}>
              التحديثات الفورية مخصصة لنسخ المعاينة والإنتاج المثبتة.
            </Text>

            <TouchableOpacity activeOpacity={0.85} style={styles.primaryButton} onPress={onClose}>
              <Text style={styles.primaryButtonText}>فهمت ذلك</Text>
            </TouchableOpacity>
          </View>
        );

      case 'error':
        return (
          <View style={styles.stateWrapper}>
            <View style={[styles.iconCircle, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="alert-circle-outline" size={30} color="#DC2626" />
            </View>

            <View style={styles.badgeRow}>
              <View style={[styles.versionBadge, { backgroundColor: '#FEE2E2' }]}>
                <Text style={[styles.versionBadgeText, { color: '#DC2626' }]}>تعذر التحديث</Text>
              </View>
            </View>

            <Text style={styles.modalTitle}>تعذر فحص التحديثات</Text>
            <Text style={styles.modalSubtitle}>
              {errorMessage || 'يرجى التأكد من اتصال الإنترنت والمحاولة مجدداً.'}
            </Text>

            <TouchableOpacity activeOpacity={0.85} style={styles.primaryButton} onPress={onRetry}>
              <Ionicons name="refresh" size={17} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>إعادة المحاولة</Text>
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (isDismissible) onClose();
      }}
    >
      <TouchableWithoutFeedback
        onPress={() => {
          if (isDismissible) onClose();
        }}
      >
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.dialogCard}>
              <View style={styles.sheetHandle} />
              {isDismissible && (
                <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
                  <Ionicons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              )}
              {renderContent()}
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
    width: 38,
    height: 4,
    borderRadius: 2,
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
  stateWrapper: {
    width: '100%',
    alignItems: 'center',
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  badgeRow: {
    marginBottom: 8,
  },
  versionBadge: {
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  versionBadgeText: {
    color: '#4F46E5',
    fontSize: 11.5,
    fontWeight: '700',
  },
  modalTitle: {
    fontSize: 17.5,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: '#4F46E5',
    borderRadius: 13,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  progressBarTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    width: '80%',
    backgroundColor: '#4F46E5',
    borderRadius: 3,
  },
});
