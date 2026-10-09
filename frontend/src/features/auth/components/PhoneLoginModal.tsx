import React, { useState, useEffect } from 'react';
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
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';

interface PhoneLoginModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function PhoneLoginModal({ visible, onClose }: PhoneLoginModalProps) {
  const { requestOtp, loginWithPhoneOtp, isAuthenticating } = useAuth();
  
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [countryCode, setCountryCode] = useState<'+966' | '+20'>('+966');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);

  useEffect(() => {
    let timer: any;
    if (resendCountdown > 0) {
      timer = setTimeout(() => {
        setResendCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setStep('PHONE');
      setPhoneNumber('');
      setOtpCode('');
      setErrorMessage(null);
      setResendCountdown(0);
    }
  }, [visible]);

  function getFullPhoneNumber(): string {
    let clean = phoneNumber.trim().replace(/^0+/, '');
    return `${countryCode}${clean}`;
  }

  async function handleSendOtp() {
    setErrorMessage(null);
    const clean = phoneNumber.trim();
    if (!clean) {
      setErrorMessage('يرجى إدخال رقم الجوال');
      return;
    }

    const fullPhone = getFullPhoneNumber();
    const res = await requestOtp(fullPhone);

    if (res.success) {
      setStep('OTP');
      setResendCountdown(60);
    } else {
      setErrorMessage(res.error || 'فشل إرسال رمز التحقق، يرجى المحاولة لاحقاً');
    }
  }

  async function handleVerifyOtp() {
    setErrorMessage(null);
    const cleanCode = otpCode.trim();
    if (cleanCode.length < 4) {
      setErrorMessage('يرجى إدخال رمز التحقق المكون من الأرقام المستلمة');
      return;
    }

    const fullPhone = getFullPhoneNumber();
    const success = await loginWithPhoneOtp(fullPhone, cleanCode);

    if (success) {
      onClose();
    } else {
      setErrorMessage('رمز التحقق غير صحيح أو انتهت صلاحيته');
    }
  }

  async function handleResend() {
    if (resendCountdown > 0) return;
    setErrorMessage(null);
    const fullPhone = getFullPhoneNumber();
    const res = await requestOtp(fullPhone);
    if (res.success) {
      setResendCountdown(60);
    } else {
      setErrorMessage(res.error || 'فشل إعادة الإرسال');
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.container}
            >
              <View style={styles.header}>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color="#6B5E82" />
                </TouchableOpacity>
                <Text style={styles.title}>
                  {step === 'PHONE' ? 'تسجيل الدخول برقم الجوال' : 'تأكيد رمز التحقق'}
                </Text>
                <View style={{ width: 32 }} />
              </View>

              {errorMessage && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color="#EF4444" />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              {step === 'PHONE' ? (
                <View style={styles.body}>
                  <Text style={styles.subtitle}>
                    أدخل رقم الجوال المسجل لاستلام رمز التحقق لمرة واحدة (SMS OTP)
                  </Text>

                  {/* Country Code Selector */}
                  <View style={styles.countryTabs}>
                    <TouchableOpacity
                      style={[
                        styles.countryTab,
                        countryCode === '+966' && styles.countryTabActive,
                      ]}
                      onPress={() => setCountryCode('+966')}
                    >
                      <Text style={styles.flag}>🇸🇦</Text>
                      <Text
                        style={[
                          styles.countryTabText,
                          countryCode === '+966' && styles.countryTabTextActive,
                        ]}
                      >
                        السعودية (+966)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.countryTab,
                        countryCode === '+20' && styles.countryTabActive,
                      ]}
                      onPress={() => setCountryCode('+20')}
                    >
                      <Text style={styles.flag}>🇪🇬</Text>
                      <Text
                        style={[
                          styles.countryTabText,
                          countryCode === '+20' && styles.countryTabTextActive,
                        ]}
                      >
                        مصر (+20)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Phone Input */}
                  <View style={styles.inputWrapper}>
                    <Text style={styles.prefixText}>{countryCode}</Text>
                    <TextInput
                      style={styles.phoneInput}
                      placeholder={countryCode === '+966' ? '5XXXXXXXX' : '10XXXXXXXX'}
                      placeholderTextColor="#A396B8"
                      keyboardType="phone-pad"
                      value={phoneNumber}
                      onChangeText={(t) => {
                        setPhoneNumber(t);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      autoFocus={true}
                      maxLength={12}
                    />
                    <MaterialCommunityIcons name="phone-outline" size={22} color="#6B5E82" />
                  </View>

                  {/* Submit Button */}
                  <TouchableOpacity
                    style={[styles.primaryButton, isAuthenticating && styles.buttonDisabled]}
                    onPress={handleSendOtp}
                    disabled={isAuthenticating}
                    activeOpacity={0.85}
                  >
                    {isAuthenticating ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryButtonText}>إرسال رمز التحقق</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.body}>
                  <Text style={styles.subtitle}>
                    تم إرسال رمز التحقق إلى الرقم{' '}
                    <Text style={styles.highlightText}>{getFullPhoneNumber()}</Text>
                  </Text>

                  {/* OTP Input */}
                  <View style={styles.otpInputWrapper}>
                    <TextInput
                      style={styles.otpInput}
                      placeholder="• • • • • •"
                      placeholderTextColor="#A396B8"
                      keyboardType="number-pad"
                      value={otpCode}
                      onChangeText={(t) => {
                        setOtpCode(t);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      autoFocus={true}
                      maxLength={6}
                    />
                  </View>

                  {/* Verify Button */}
                  <TouchableOpacity
                    style={[styles.primaryButton, isAuthenticating && styles.buttonDisabled]}
                    onPress={handleVerifyOtp}
                    disabled={isAuthenticating}
                    activeOpacity={0.85}
                  >
                    {isAuthenticating ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryButtonText}>تأكيد والدخول</Text>
                    )}
                  </TouchableOpacity>

                  {/* Resend & Change Phone Actions */}
                  <View style={styles.otpFooter}>
                    <TouchableOpacity
                      onPress={handleResend}
                      disabled={resendCountdown > 0 || isAuthenticating}
                    >
                      <Text
                        style={[
                          styles.resendText,
                          resendCountdown > 0 && styles.resendTextDisabled,
                        ]}
                      >
                        {resendCountdown > 0
                          ? `إعادة الإرسال بعد ${resendCountdown} ثانية`
                          : 'إعادة إرسال الرمز'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setStep('PHONE')}>
                      <Text style={styles.changePhoneText}>تغيير رقم الجوال</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </KeyboardAvoidingView>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A0A33',
    textAlign: 'center',
  },
  body: {
    paddingTop: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B5E82',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  highlightText: {
    fontWeight: '700',
    color: '#3F0082',
  },
  countryTabs: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  countryTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#F9F7FD',
    borderWidth: 1.5,
    borderColor: '#E9E3F3',
    gap: 8,
  },
  countryTabActive: {
    backgroundColor: '#FAF5FF',
    borderColor: '#3F0082',
  },
  flag: {
    fontSize: 18,
  },
  countryTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B5E82',
  },
  countryTabTextActive: {
    color: '#3F0082',
    fontWeight: '700',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9F7FD',
    borderWidth: 1.5,
    borderColor: '#E0D7F0',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 20,
  },
  prefixText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3F0082',
    marginRight: 12,
  },
  phoneInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#1A0A33',
    textAlign: 'left',
  },
  otpInputWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9F7FD',
    borderWidth: 1.5,
    borderColor: '#3F0082',
    borderRadius: 18,
    height: 64,
    marginBottom: 20,
  },
  otpInput: {
    fontSize: 26,
    fontWeight: '800',
    color: '#3F0082',
    letterSpacing: 10,
    textAlign: 'center',
    width: '100%',
  },
  primaryButton: {
    height: 54,
    borderRadius: 16,
    backgroundColor: '#3F0082',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3F0082',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  otpFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 18,
    paddingHorizontal: 4,
  },
  resendText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3F0082',
  },
  resendTextDisabled: {
    color: '#A396B8',
  },
  changePhoneText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B5E82',
    textDecorationLine: 'underline',
  },
  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    borderColor: '#FCA5A5',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
    marginBottom: 14,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
});
