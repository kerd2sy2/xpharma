import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { selectActivePharmacies } from '@/services/subscription';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface PharmacyItemOption {
  code: string;
  name: string;
  is_suspended?: boolean;
}

interface SelectActivePharmaciesModalProps {
  visible: boolean;
  onClose?: () => void;
  userEmail: string;
  allowedPharmacies: number;
  pharmacies: PharmacyItemOption[];
  onSuccess: (activeCodes: string[]) => void;
  onUpgradePress: () => void;
}

export default function SelectActivePharmaciesModal({
  visible,
  onClose,
  userEmail,
  allowedPharmacies,
  pharmacies,
  onSuccess,
  onUpgradePress,
}: SelectActivePharmaciesModalProps) {
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Initialize selected codes based on allowedPharmacies and active non-suspended pharmacies
  useEffect(() => {
    if (!visible || pharmacies.length === 0) return;

    // Filter pharmacies that are currently active (not suspended)
    const currentlyActive = pharmacies.filter((p) => !p.is_suspended).map((p) => p.code);

    if (currentlyActive.length > 0 && currentlyActive.length <= allowedPharmacies) {
      setSelectedCodes(currentlyActive);
    } else {
      // Pick first allowedPharmacies
      const initial = pharmacies.slice(0, Math.max(1, allowedPharmacies)).map((p) => p.code);
      setSelectedCodes(initial);
    }
  }, [visible, pharmacies, allowedPharmacies]);

  const togglePharmacy = (code: string) => {
    if (selectedCodes.includes(code)) {
      if (selectedCodes.length === 1) {
        Alert.alert('تنبيه', 'يجب تحديد صيدلية واحدة نشطة على الأقل.');
        return;
      }
      setSelectedCodes((prev) => prev.filter((c) => c !== code));
    } else {
      if (selectedCodes.length >= allowedPharmacies) {
        Alert.alert(
          'تجاوز حد الباقة',
          `باقتك الحالية تسمح بتشغيل ${allowedPharmacies} ${
            allowedPharmacies === 1 ? 'صيدلية واحدة' : 'صيدليات'
          } فقط.\n\nيمكنك إلغاء تحديد فرع آخر لتحديد هذا الفرع، أو ترقية باقتك لتشغيل جميع الفروع معاً.`,
          [
            { text: 'إلغاء', style: 'cancel' },
            { text: 'ترقية الباقة ⚡', onPress: onUpgradePress },
          ]
        );
        return;
      }
      setSelectedCodes((prev) => [...prev, code]);
    }
  };

  const handleConfirm = async () => {
    if (selectedCodes.length === 0) {
      Alert.alert('تنبيه', 'يرجى تحديد صيدلية واحدة على الأقل.');
      return;
    }

    if (selectedCodes.length > allowedPharmacies) {
      Alert.alert(
        'تنبيه',
        `يرجى اختيار ${allowedPharmacies} ${allowedPharmacies === 1 ? 'صيدلية' : 'صيدليات'} كحد أقصى.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await selectActivePharmacies(userEmail, selectedCodes);
      if (res.success) {
        onSuccess(selectedCodes);
      } else {
        Alert.alert('خطأ', res.error || 'فشل تحديث حالة الصيدليات، يرجى المحاولة مرة أخرى.');
      }
    } catch (e: any) {
      Alert.alert('خطأ', e.message || 'حدث خطأ غير متوقع أثناء الاتصال بالخادم.');
    } finally {
      setSubmitting(false);
    }
  };

  const colors = {
    bg: '#FFFFFF',
    text: '#1A0A33',
    secondaryText: '#6B5E82',
    border: '#E9E3F3',
    primary: '#3f0082',
    primarySoft: '#3f008215',
    warning: '#D97706',
    warningBg: '#FEF3C7',
    success: '#059669',
    successBg: '#D1FAE5',
    danger: '#DC2626',
    dangerBg: '#FEE2E2',
  };

  const isMaxReached = selectedCodes.length === allowedPharmacies;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose ? onClose : () => {}}
    >
      <TouchableWithoutFeedback onPress={onClose ? onClose : undefined}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.sheet}>
              {/* Handle Bar */}
              <View style={styles.handleContainer}>
                <View style={styles.handle} />
              </View>

              {/* Header Icon & Title */}
              <View style={styles.header}>
                <View style={styles.iconCircle}>
                  <MaterialCommunityIcons name="layers-search-outline" size={32} color="#3f0082" />
                </View>
                <Text style={styles.title}>تحديد الصيدليات النشطة لباقتك</Text>
                <Text style={styles.subtitle}>
                  باقتك الحالية تسمح بتشغيل{' '}
                  <Text style={{ fontWeight: '800', color: colors.primary }}>
                    {allowedPharmacies}{' '}
                    {allowedPharmacies === 1
                      ? 'صيدلية واحدة'
                      : allowedPharmacies === 2
                      ? 'صيدليتين'
                      : 'صيدليات'}
                  </Text>{' '}
                  فقط من أصل {pharmacies.length} صيدليات مسجلة. لن يتم حذف أي بيانات أو فواتير للصيدليات المعلقة.
                </Text>

                {/* Counter Pill */}
                <View
                  style={[
                    styles.counterPill,
                    {
                      backgroundColor: isMaxReached ? '#ECFDF5' : '#FFFBEB',
                      borderColor: isMaxReached ? '#A7F3D0' : '#FDE68A',
                    },
                  ]}
                >
                  <Ionicons
                    name={isMaxReached ? 'checkmark-circle' : 'alert-circle'}
                    size={18}
                    color={isMaxReached ? '#059669' : '#D97706'}
                  />
                  <Text
                    style={[
                      styles.counterText,
                      { color: isMaxReached ? '#059669' : '#D97706' },
                    ]}
                  >
                    تم تحديد {selectedCodes.length} من أصل {allowedPharmacies} مسموح بها
                  </Text>
                </View>
              </View>

              {/* Scrollable Pharmacy Selection List */}
              <ScrollView
                style={styles.scrollArea}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sectionHeader}>اختر الفروع التي ترغب في تشغيلها الآن:</Text>

                {pharmacies.map((item) => {
                  const isSelected = selectedCodes.includes(item.code);
                  return (
                    <TouchableOpacity
                      key={item.code}
                      activeOpacity={0.7}
                      onPress={() => togglePharmacy(item.code)}
                      style={[
                        styles.pharmacyCard,
                        isSelected && styles.pharmacyCardSelected,
                      ]}
                    >
                      <View style={styles.pharmacyInfo}>
                        <View style={styles.pharmacyNameRow}>
                          <Text style={styles.pharmacyName} numberOfLines={1}>
                            {item.name || item.code}
                          </Text>
                          {isSelected ? (
                            <View style={styles.statusBadgeActive}>
                              <Text style={styles.statusBadgeActiveText}>نشط</Text>
                            </View>
                          ) : (
                            <View style={styles.statusBadgeSuspended}>
                              <Text style={styles.statusBadgeSuspendedText}>معلق مؤقتاً</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.pharmacyCode}>كود الفرع: {item.code}</Text>
                      </View>

                      {/* Custom Radio / Checkbox */}
                      <View
                        style={[
                          styles.checkboxCircle,
                          isSelected && styles.checkboxCircleSelected,
                        ]}
                      >
                        {isSelected && (
                          <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* Upgrade Promo Card */}
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={onUpgradePress}
                  style={styles.upgradeCard}
                >
                  <LinearGradient
                    colors={['#3f0082', '#6b11a8']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.upgradeGradient}
                  >
                    <View style={styles.upgradeContent}>
                      <View style={styles.upgradeHeaderRow}>
                        <Ionicons name="flash" size={20} color="#FBBF24" />
                        <Text style={styles.upgradeTitle}>تشغيل جميع الفروع بلا تعليق؟</Text>
                      </View>
                      <Text style={styles.upgradeDesc}>
                        قم بترقية باقتك إلى باقة ({pharmacies.length} صيدليات) لتشغيل كافة فروعك معاً
                        على مدار الساعة دون توقف أو استثناء.
                      </Text>
                    </View>
                    <View style={styles.upgradeBtn}>
                      <Text style={styles.upgradeBtnText}>ترقية الآن</Text>
                      <Ionicons name="arrow-back" size={16} color="#3f0082" />
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              </ScrollView>

              {/* Footer Confirm Button */}
              <View style={styles.footer}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleConfirm}
                  disabled={submitting || selectedCodes.length === 0}
                  style={[
                    styles.confirmButton,
                    (submitting || selectedCodes.length === 0) && styles.confirmButtonDisabled,
                  ]}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Text style={styles.confirmButtonText}>
                        حفظ وتفعيل الفروع المختارة ({selectedCodes.length})
                      </Text>
                      <Ionicons name="checkmark-done" size={20} color="#FFFFFF" />
                    </>
                  )}
                </TouchableOpacity>

                {onClose && (
                  <TouchableOpacity
                    onPress={onClose}
                    disabled={submitting}
                    style={styles.cancelBtn}
                  >
                    <Text style={styles.cancelBtnText}>إلغاء</Text>
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: SCREEN_HEIGHT * 0.88,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E2D9F3',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3E8FF',
  },
  iconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1A0A33',
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: '#6B5E82',
    textAlign: 'center',
    marginBottom: 12,
  },
  counterPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  counterText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scrollArea: {
    maxHeight: SCREEN_HEIGHT * 0.44,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B3F6B',
    textAlign: 'right',
    marginBottom: 12,
  },
  pharmacyCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#EDE7F6',
    backgroundColor: '#FAF8FD',
    marginBottom: 10,
  },
  pharmacyCardSelected: {
    borderColor: '#3f0082',
    backgroundColor: '#FBF8FF',
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  pharmacyInfo: {
    flex: 1,
    marginRight: 12,
    alignItems: 'flex-end',
  },
  pharmacyNameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  pharmacyName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A0A33',
    textAlign: 'right',
  },
  pharmacyCode: {
    fontSize: 12,
    color: '#8A7A9E',
    textAlign: 'right',
  },
  statusBadgeActive: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusBadgeActiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  statusBadgeSuspended: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusBadgeSuspendedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B91C1C',
  },
  checkboxCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#C4B5FD',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxCircleSelected: {
    borderColor: '#3f0082',
    backgroundColor: '#3f0082',
  },
  upgradeCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 10,
    elevation: 3,
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  upgradeGradient: {
    padding: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upgradeContent: {
    flex: 1,
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  upgradeHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  upgradeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'right',
  },
  upgradeDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: '#E9D5FF',
    textAlign: 'right',
  },
  upgradeBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FBBF24',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  upgradeBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A0A33',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3E8FF',
  },
  confirmButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3f0082',
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmButtonDisabled: {
    backgroundColor: '#A899C4',
    shadowOpacity: 0,
    elevation: 0,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  cancelBtnText: {
    fontSize: 13,
    color: '#8A7A9E',
    fontWeight: '600',
  },
});
