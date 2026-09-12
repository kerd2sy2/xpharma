import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
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
  const isDark = false;
  const { user } = useAuth();

  const [pharmacyCode, setPharmacyCode] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colors = {
    bg: '#FFFFFF',
    overlay: 'rgba(0, 0, 0, 0.65)',
    text: '#1A0A33',
    secondaryText: '#6B5E82',
    border: '#E9E3F3',
    inputBg: '#F7F6FC',
    primary: '#3f0082',
    accent: '#00d780',
    primarySoft: '#3f008215',
    successSoft: '#00d78018',
    danger: '#EF4444',
  };

  const handleVerify = async () => {
    if (!warehouse) return;
    if (!pharmacyCode.trim()) {
      setError('اكتب كود الصيدلية في المخزن الأول');
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
        setError(res.error || 'كود الصيدلية أو الموبايل مش متطابق مع بيانات المخزن');
      }
    } catch (e: any) {
      setError(e.message || 'حصلت مشكلة في الاتصال.. اتأكد من النت وجرب تاني');
    } finally {
      setLoading(false);
    }
  };

  if (!warehouse) return null;

  const logoUri = warehouse.logo_url
    ? warehouse.logo_url.startsWith('http')
      ? warehouse.logo_url
      : `https://xpharma.cloud${warehouse.logo_url}`
    : null;

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
                  <View style={[styles.handle, { backgroundColor: '#CBD5E1' }]} />
                </View>

                {/* Warehouse Badge Header */}
                <View style={styles.header}>
                  {logoUri ? (
                    <Image
                      source={{ uri: logoUri }}
                      style={styles.warehouseLogoImg}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.crestIcon, { backgroundColor: colors.primarySoft }]}>
                      <Ionicons name="business" size={28} color={colors.primary} />
                    </View>
                  )}
                  <View style={styles.headerInfo}>
                    <Text style={[styles.warehouseTitle, { color: colors.text }]}>
                      {warehouse.name}
                    </Text>
                    <Text style={[styles.headerSubtitle, { color: colors.secondaryText }]}>
                      ربط حساب الصيدلية وفتح الفواتير
                    </Text>
                  </View>
                </View>

                {/* Info Callout */}
                <View style={[styles.callout, { backgroundColor: colors.successSoft }]}>
                  <Ionicons name="information-circle-outline" size={20} color="#00d780" />
                  <Text style={[styles.calloutText, { color: '#047857' }]}>
                    اكتب كود صيدليتك في المخزن، ورقم الموبايل عشان نفتحلك الفواتير والمرتجعات وكشف الحساب مباشرة.
                  </Text>
                </View>

                {/* Error Banner & Support Contact */}
                {error && (
                  <View style={styles.errorBox}>
                    <View style={styles.errorTextRow}>
                      <Ionicons name="alert-circle" size={18} color="#EF4444" />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                    {warehouse.contact_phone ? (
                      <TouchableOpacity
                        style={styles.supportCallBtn}
                        onPress={() => Linking.openURL(`tel:${warehouse.contact_phone}`)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="call" size={13} color="#FFFFFF" />
                        <Text style={styles.supportCallBtnText}>
                          اتصل بدعم المخزن لحل مشكلة الربط: {warehouse.contact_phone}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}

                {/* Form Fields */}
                <View style={styles.form}>
                  {/* Pharmacy Code */}
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: colors.text }]}>
                      كود صيدليتك في المخزن <Text style={styles.requiredStar}>*</Text>
                    </Text>
                    <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                      <Ionicons name="barcode-outline" size={20} color={colors.secondaryText} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="مثلاً: 2877"
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
                      رقم الموبايل
                    </Text>
                    <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                      <Ionicons name="call-outline" size={20} color={colors.secondaryText} style={styles.inputIcon} />
                      <TextInput
                        style={[styles.input, { color: colors.text }]}
                        placeholder="010XXXXXXXX (لو متسجل عند المخزن)"
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
                        <Text style={styles.submitBtnText}>افتح حساب الصيدلية</Text>
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
                      رجوع
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Warehouse Location & Support info if available */}
                {(warehouse.contact_phone || warehouse.address) && (
                  <View style={styles.warehouseMetaInfo}>
                    {warehouse.address ? (
                      <View style={styles.metaInfoRow}>
                        <Ionicons name="location-outline" size={14} color={colors.secondaryText} />
                        <Text style={[styles.metaInfoText, { color: colors.secondaryText }]}>
                          {warehouse.address}
                        </Text>
                      </View>
                    ) : null}
                    {warehouse.contact_phone ? (
                      <TouchableOpacity
                        style={styles.metaInfoRow}
                        onPress={() => Linking.openURL(`tel:${warehouse.contact_phone}`)}
                      >
                        <Ionicons name="call-outline" size={14} color={colors.primary} />
                        <Text style={[styles.metaInfoText, { color: colors.primary, fontWeight: '700' }]}>
                          دعم العملاء للمخزن: {warehouse.contact_phone}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                )}
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
  warehouseLogoImg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 14,
    marginBottom: 14,
    gap: 8,
  },
  errorTextRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
    fontWeight: '600',
    lineHeight: 18,
  },
  supportCallBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EF4444',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  supportCallBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
  warehouseMetaInfo: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 6,
  },
  metaInfoRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  metaInfoText: {
    fontSize: 12,
    textAlign: 'right',
  },
});
