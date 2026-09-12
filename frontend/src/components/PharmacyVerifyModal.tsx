import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Warehouse, verifyPharmacy, VerifyPharmacyResult } from '@/services/warehouse';
import { useAuth } from '@/context/AuthContext';

interface PharmacyVerifyModalProps {
  visible: boolean;
  warehouse: Warehouse | null;
  onClose: () => void;
  onSuccess: (result: VerifyPharmacyResult) => void;
}

export default function PharmacyVerifyModal({
  visible,
  warehouse,
  onClose,
  onSuccess,
}: PharmacyVerifyModalProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { user } = useAuth();

  const [pharmacyCode, setPharmacyCode] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colors = {
    bg: isDark ? '#141B2D' : '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.65)',
    text: isDark ? '#F8FAFC' : '#0F172A',
    secondaryText: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? '#1E293B' : '#E2E8F0',
    inputBg: isDark ? '#0A0E1A' : '#F1F5F9',
    primary: '#2563EB',
    danger: '#EF4444',
  };

  const handleVerify = async () => {
    if (!warehouse) return;
    if (!pharmacyCode.trim()) {
      setError('يرجى إدخال رقم كود الصيدلية المسجل لدى المستودع');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await verifyPharmacy(
        warehouse.id,
        pharmacyCode.trim(),
        phone.trim(),
        user?.id,
        user?.email
      );

      if (res.success) {
        setPharmacyCode('');
        setPhone('');
        onSuccess(res);
      } else {
        setError(res.error || 'تعذر التحقق من كود الصيدلية ورقم الهاتف');
      }
    } catch (e: any) {
      setError(e.message || 'حدث خطأ أثناء محاولة التحقق');
    } finally {
      setLoading(false);
    }
  };

  if (!warehouse) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.keyboardAvoid}
            >
              <View style={[styles.sheet, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                {/* Drag Handle */}
                <View style={styles.handleContainer}>
                  <View style={[styles.handle, { backgroundColor: isDark ? '#334155' : '#CBD5E1' }]} />
                </View>

                {/* Warehouse Badge Header */}
                <View style={styles.header}>
                  <View style={[styles.crestIcon, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF' }]}>
                    <Ionicons name="business" size={28} color={colors.primary} />
                  </View>
                  <View style={styles.headerInfo}>
                    <Text style={[styles.warehouseTitle, { color: colors.text }]}>
                      {warehouse.name}
                    </Text>
                    <Text style={[styles.headerSubtitle, { color: colors.secondaryText }]}>
                      ربط الصيدلية واستعراض الحسابات
                    </Text>
                  </View>
                </View>

                {/* Info Callout */}
                <View style={[styles.callout, { backgroundColor: isDark ? '#1E293B66' : '#F0FDF4' }]}>
                  <Ionicons name="information-circle-outline" size={20} color="#10B981" />
                  <Text style={[styles.calloutText, { color: isDark ? '#A7F3D0' : '#166534' }]}>
                    أدخل كود الصيدلية ورقم الهاتف كما هو مسجل في سيستم المستودع لفتح الفواتير وكشف الحساب.
                  </Text>
                </View>

                {/* Error Banner */}
                {error && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={18} color="#EF4444" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {/* Form Fields */}
                <View style={styles.form}>
                  {/* Pharmacy Code */}
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: colors.text }]}>
                      كود الصيدلية بالمستودع <Text style={styles.requiredStar}>*</Text>
                    </Text>
                    <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                      <Ionicons name="barcode-outline" size={20} color={colors.secondaryText} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="مثال: 2877"
                        placeholderTextColor={colors.secondaryText}
                        keyboardType="numeric"
                        value={pharmacyCode}
                        onChangeText={(t) => {
                          setPharmacyCode(t);
                          if (error) setError(null);
                        }}
                        autoFocus
                      />
                    </View>
                  </View>

                  {/* Phone Number */}
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: colors.text }]}>
                      رقم الهاتف المسجل
                    </Text>
                    <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                      <Ionicons name="call-outline" size={20} color={colors.secondaryText} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="010XXXXXXXX (اختياري للتحقق)"
                        placeholderTextColor={colors.secondaryText}
                        keyboardType="phone-pad"
                        value={phone}
                        onChangeText={(t) => {
                          setPhone(t);
                          if (error) setError(null);
                        }}
                      />
                    </View>
                  </View>
                </View>

                {/* Action Buttons */}
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.submitBtn, { backgroundColor: colors.primary }]}
                    onPress={handleVerify}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <View style={styles.btnContent}>
                        <Ionicons name="checkmark-circle-outline" size={20} color="#FFFFFF" />
                        <Text style={styles.submitBtnText}>تحقق وفتح الحسابات</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.cancelBtn, { borderColor: colors.border }]}
                    onPress={onClose}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.cancelBtnText, { color: colors.secondaryText }]}>
                      إلغاء
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  keyboardAvoid: {
    width: '100%',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 38 : 24,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
    marginTop: 8,
    marginBottom: 16,
  },
  crestIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'flex-end',
  },
  warehouseTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  callout: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  calloutText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'right',
  },
  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
    fontWeight: '600',
  },
  form: {
    gap: 14,
    marginBottom: 20,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  requiredStar: {
    color: '#EF4444',
  },
  inputWrapper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 50,
  },
  inputIcon: {
    marginLeft: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    textAlign: 'right',
    height: '100%',
  },
  actions: {
    gap: 10,
  },
  submitBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnContent: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelBtn: {
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
