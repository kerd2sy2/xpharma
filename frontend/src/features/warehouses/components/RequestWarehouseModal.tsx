import React from 'react';
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
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RequestWarehouseModalProps {
  visible: boolean;
  onClose: () => void;
  warehouseName: string;
  setWarehouseName: (val: string) => void;
  warehousePhone: string;
  setWarehousePhone: (val: string) => void;
  submitting: boolean;
  success: boolean;
  onSubmit: () => Promise<void>;
  onSuccessDone: () => void;
}

export function RequestWarehouseModal({
  visible,
  onClose,
  warehouseName,
  setWarehouseName,
  warehousePhone,
  setWarehousePhone,
  submitting,
  success,
  onSubmit,
  onSuccessDone,
}: RequestWarehouseModalProps) {
  const colors = {
    bg: '#F9F7FD',
    card: '#FFFFFF',
    text: '#1A0A33',
    secondaryText: '#6B5E82',
    border: '#E9E3F3',
    primary: '#3f0082',
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.modalOverlayBottom}>
            <TouchableWithoutFeedback>
              <View style={[styles.bottomSheetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

                <View style={styles.sheetHeaderRow}>
                  <TouchableOpacity
                    style={[styles.closeIconBtnHeader, { borderColor: colors.border }]}
                    onPress={onClose}
                  >
                    <Ionicons name="close" size={20} color={colors.text} />
                  </TouchableOpacity>
                  <Text style={[styles.sheetHeaderTitle, { color: colors.text }]}>طلب إضافة مخزن</Text>
                  <View style={{ width: 32 }} />
                </View>

                {success ? (
                  <View style={styles.requestSuccessBox}>
                    <View style={styles.successIconCircle}>
                      <Ionicons name="checkmark-circle" size={56} color="#10B981" />
                    </View>
                    <Text style={[styles.successTitle, { color: colors.text }]}>
                      تم استلام طلبك بنجاح!
                    </Text>
                    <Text style={[styles.successSubtitle, { color: colors.secondaryText }]}>
                      سيتواصل فريق دعم التطبيق مع إدارة المخزن للاشتراك في البرنامج وتوفير بياناته لك فوراً.
                    </Text>
                    <TouchableOpacity
                      style={[styles.successDoneBtn, { backgroundColor: colors.primary }]}
                      onPress={onSuccessDone}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.successDoneBtnText}>تمام، شكراً</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.requestForm}>
                    <Text style={[styles.requestSubtitle, { color: colors.secondaryText }]}>
                      المخزن مش موجود؟ اكتب بياناته وسيقوم فريق دعم التطبيق بالتواصل معه للاشتراك في البرنامج وربطه لك.
                    </Text>

                    <View style={styles.formGroup}>
                      <Text style={[styles.inputLabel, { color: colors.text }]}>اسم المخزن</Text>
                      <View style={[styles.modalInputWrapper, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                        <Ionicons name="business-outline" size={19} color={colors.secondaryText} style={styles.modalInputIcon} />
                        <TextInput
                          value={warehouseName}
                          onChangeText={setWarehouseName}
                          placeholder="اكتب اسم المخزن..."
                          placeholderTextColor={colors.secondaryText}
                          style={[styles.modalTextInput, { color: colors.text }]}
                        />
                      </View>
                    </View>

                    <View style={styles.formGroup}>
                      <Text style={[styles.inputLabel, { color: colors.text }]}>رقم تليفون / واتساب المخزن للتواصل</Text>
                      <View style={[styles.modalInputWrapper, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                        <Ionicons name="call-outline" size={19} color={colors.secondaryText} style={styles.modalInputIcon} />
                        <TextInput
                          value={warehousePhone}
                          onChangeText={setWarehousePhone}
                          placeholder="مثال: 01012345678"
                          placeholderTextColor={colors.secondaryText}
                          keyboardType="phone-pad"
                          style={[styles.modalTextInput, { color: colors.text }]}
                        />
                      </View>
                    </View>

                    <TouchableOpacity
                      style={[
                        styles.requestSubmitBtn,
                        { backgroundColor: colors.primary },
                        submitting && { opacity: 0.75 },
                      ]}
                      onPress={onSubmit}
                      disabled={submitting}
                      activeOpacity={0.85}
                    >
                      {submitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Ionicons name="paper-plane-outline" size={18} color="#FFFFFF" />
                          <Text style={styles.requestSubmitBtnText}>إرسال الطلب لفريق الدعم</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
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
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 16,
  },
  sheetHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  closeIconBtnHeader: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestForm: {
    width: '100%',
    gap: 12,
  },
  requestSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'right',
    lineHeight: 20,
    marginBottom: 2,
  },
  formGroup: {
    width: '100%',
    gap: 6,
  },
  inputLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    textAlign: 'right',
  },
  modalInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 48,
  },
  modalInputIcon: {
    marginRight: 8,
  },
  modalTextInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  requestSubmitBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 48,
    borderRadius: 14,
    marginTop: 6,
  },
  requestSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  requestSuccessBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  successIconCircle: {
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  successDoneBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
    marginTop: 10,
  },
  successDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
