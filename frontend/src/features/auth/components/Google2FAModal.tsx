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

export default function Google2FAModal() {
  const {
    google2FAState,
    cancelGoogle2FA,
    sendGooglePhoneOtp,
    verifyGooglePhoneOtp,
    verifyGoogleOtp,
    resendGoogleOtp,
    isAuthenticating,
  } = useAuth();

  const isVisible = !!google2FAState;
  const isSetupMode = !!google2FAState?.requiresPhone;

  // For setup mode (first-time Google login)
  const [setupStep, setSetupStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [countryCode, setCountryCode] = useState<'+966' | '+20'>('+966');
  const [phoneNumber, setPhoneNumber] = useState('');

  // For OTP verification
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

  // Reset state on open/close
  useEffect(() => {
    if (isVisible) {
      setSetupStep('PHONE');
      setPhoneNumber('');
      setOtpCode('');
      setErrorMessage(null);
      if (google2FAState?.requiresOtp) {
        setResendCountdown(60);
      } else {
        setResendCountdown(0);
      }
    }
  }, [isVisible, google2FAState?.requiresOtp]);

  function getFullPhoneNumber(): string {
    let clean = phoneNumber.trim().replace(/^0+/, '');
    return `${countryCode}${clean}`;
  }

  async function handleSendSetupOtp() {
    setErrorMessage(null);
    const clean = phoneNumber.trim();
    if (!clean) {
      setErrorMessage('يرجى إدخال رقم الجوال');
      return;
    }

    const fullPhone = getFullPhoneNumber();
    const res = await sendGooglePhoneOtp(fullPhone);

    if (res.success) {
      setSetupStep('OTP');
      setResendCountdown(60);
    } else {
      setErrorMessage(res.error || 'فشل إرسال رمز التحقق، يرجى المحاولة لاحقاً');
    }
  }

  async function handleVerifySetupOtp(codeToUse?: string) {
    setErrorMessage(null);
    const cleanCode = (codeToUse || otpCode).trim();
    if (cleanCode.length < 4) {
      setErrorMessage('يرجى إدخال رمز التحقق المكون من 6 أرقام');
      return;
    }

    const fullPhone = getFullPhoneNumber();
    const success = await verifyGooglePhoneOtp(fullPhone, cleanCode);
    if (!success && !errorMessage) {
      setErrorMessage('رمز التحقق غير صحيح أو انتهت صلاحيته');
    }
  }

  async function handleVerifyReturningOtp(codeToUse?: string) {
    setErrorMessage(null);
    const cleanCode = (codeToUse || otpCode).trim();
    if (cleanCode.length < 4) {
      setErrorMessage('يرجى إدخال رمز التحقق المكون من 6 أرقام');
      return;
    }

    const success = await verifyGoogleOtp(cleanCode);
    if (!success && !errorMessage) {
      setErrorMessage('رمز التحقق غير صحيح أو انتهت صلاحيته');
    }
  }

  async function handleResend() {
    if (resendCountdown > 0) return;
    setErrorMessage(null);
    if (isSetupMode) {
      const fullPhone = getFullPhoneNumber();
      const res = await sendGooglePhoneOtp(fullPhone);
      if (res.success) {
        setResendCountdown(60);
      } else {
        setErrorMessage(res.error || 'فشل إعادة الإرسال');
      }
    } else {
      const res = await resendGoogleOtp();
      if (res.success) {
        setResendCountdown(60);
      } else {
        setErrorMessage(res.error || 'فشل إعادة الإرسال');
      }
    }
  }

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent={true}
      onRequestClose={cancelGoogle2FA}
    >
      <TouchableWithoutFeedback onPress={cancelGoogle2FA}>
        <View style={styles.backdrop}>
          <TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.container}
            >
              {/* Header */}
              <View style={styles.header}>
                <TouchableOpacity onPress={cancelGoogle2FA} style={styles.closeBtn}>
                  <Ionicons name="close" size={24} color="#6B5E82" />
                </TouchableOpacity>
                <View style={styles.titleContainer}>
                  <Text style={styles.title}>التحقق بخطوتين (Google 2FA)</Text>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>أمان الحساب</Text>
                  </View>
                </View>
                <View style={{ width: 32 }} />
              </View>

              {/* Error Message */}
              {errorMessage && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color="#EF4444" />
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              )}

              {/* Body */}
              {isSetupMode ? (
                // First-time user setup
                setupStep === 'PHONE' ? (
                  <View style={styles.body}>
                    <View style={styles.iconCircle}>
                      <MaterialCommunityIcons name="cellphone-lock" size={38} color="#3F0082" />
                    </View>
                    <Text style={styles.subtitle}>
                      هذا أول تسجيل دخول بحساب Google الخاص بك. يرجى إدخال رقم الجوال لربطه بحسابك وتأكيد هويتك برمز تحقق SMS لمرة واحدة.
                    </Text>

                    {/* Country Code Tabs */}
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
                      onPress={handleSendSetupOtp}
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
                  // Step 2 of setup: OTP
                  <View style={styles.body}>
                    <View style={styles.iconCircle}>
                      <MaterialCommunityIcons name="message-lock-outline" size={38} color="#3F0082" />
                    </View>
                    <Text style={styles.subtitle}>
                      تم إرسال رمز التحقق (SMS) إلى الرقم{' '}
                      <Text style={styles.highlightText}>{getFullPhoneNumber()}</Text>
                    </Text>

                    {/* OTP Input */}
                    <View style={styles.otpInputWrapper}>
                      <TextInput
                        style={styles.otpInput}
                        placeholder="• • • • • •"
                        placeholderTextColor="#A396B8"
                        keyboardType="number-pad"
                        textContentType="oneTimeCode"
                        autoComplete="sms-otp"
                        importantForAutofill="yes"
                        value={otpCode}
                        onChangeText={(t) => {
                          setOtpCode(t);
                          if (errorMessage) setErrorMessage(null);
                          if (t.trim().length === 6) {
                            handleVerifySetupOtp(t.trim());
                          }
                        }}
                        autoFocus={true}
                        maxLength={6}
                      />
                    </View>

                    {/* Verify Button */}
                    <TouchableOpacity
                      style={[styles.primaryButton, isAuthenticating && styles.buttonDisabled]}
                      onPress={() => handleVerifySetupOtp()}
                      disabled={isAuthenticating}
                      activeOpacity={0.85}
                    >
                      {isAuthenticating ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <Text style={styles.primaryButtonText}>تأكيد وربط الحساب</Text>
                      )}
                    </TouchableOpacity>

                    {/* Resend & Change Phone */}
                    <View style={styles.footerRow}>
                      <TouchableOpacity
                        onPress={handleResend}
                        disabled={resendCountdown > 0 || isAuthenticating}
                        style={styles.resendBtn}
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

                      <TouchableOpacity
                        onPress={() => {
                          setSetupStep('PHONE');
                          setOtpCode('');
                          setErrorMessage(null);
                        }}
                        style={styles.changePhoneBtn}
                      >
                        <Text style={styles.changePhoneText}>تعديل رقم الجوال</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )
              ) : (
                // Returning Google User: Auto-sent OTP
                <View style={styles.body}>
                  <View style={styles.iconCircle}>
                    <MaterialCommunityIcons name="shield-check" size={38} color="#00D780" />
                  </View>
                  <Text style={styles.subtitle}>
                    تم إرسال رمز التحقق لمرة واحدة في رسالة SMS إلى رقم الجوال المسجل:{'\n'}
                    <Text style={styles.highlightText}>{google2FAState?.phoneMasked || 'رقم هاتفك المسجل'}</Text>
                  </Text>

                  {/* OTP Input */}
                  <View style={styles.otpInputWrapper}>
                    <TextInput
                      style={styles.otpInput}
                      placeholder="• • • • • •"
                      placeholderTextColor="#A396B8"
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                      importantForAutofill="yes"
                      value={otpCode}
                      onChangeText={(t) => {
                        setOtpCode(t);
                        if (errorMessage) setErrorMessage(null);
                        if (t.trim().length === 6) {
                          handleVerifyReturningOtp(t.trim());
                        }
                      }}
                      autoFocus={true}
                      maxLength={6}
                    />
                  </View>

                  {/* Verify Button */}
                  <TouchableOpacity
                    style={[styles.primaryButton, isAuthenticating && styles.buttonDisabled]}
                    onPress={() => handleVerifyReturningOtp()}
                    disabled={isAuthenticating}
                    activeOpacity={0.85}
                  >
                    {isAuthenticating ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.primaryButtonText}>تأكيد والدخول</Text>
                    )}
                  </TouchableOpacity>

                  {/* Resend button */}
                  <TouchableOpacity
                    onPress={handleResend}
                    disabled={resendCountdown > 0 || isAuthenticating}
                    style={styles.resendCenterBtn}
                  >
                    <Text
                      style={[
                        styles.resendText,
                        resendCountdown > 0 && styles.resendTextDisabled,
                      ]}
                    >
                      {resendCountdown > 0
                        ? `إعادة إرسال الرمز بعد ${resendCountdown} ثانية`
                        : 'لم يصلك الرمز؟ إعادة الإرسال'}
                    </Text>
                  </TouchableOpacity>
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
    backgroundColor: 'rgba(26, 10, 51, 0.65)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3EEFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A0A33',
    textAlign: 'center',
  },
  badge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D28D9',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3EEFA',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
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
  body: {
    alignItems: 'stretch',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B5E82',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 18,
  },
  highlightText: {
    color: '#3F0082',
    fontWeight: '700',
  },
  countryTabs: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginBottom: 16,
  },
  countryTab: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E9E3F3',
    backgroundColor: '#F9F7FD',
    gap: 6,
  },
  countryTabActive: {
    borderColor: '#3F0082',
    backgroundColor: '#F3EEFA',
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
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E9E3F3',
    paddingHorizontal: 16,
    height: 56,
    marginBottom: 18,
  },
  prefixText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3F0082',
    marginRight: 8,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: '#1A0A33',
    textAlign: 'left',
    letterSpacing: 1,
  },
  otpInputWrapper: {
    alignItems: 'center',
    marginBottom: 20,
  },
  otpInput: {
    width: '100%',
    height: 58,
    backgroundColor: '#F9F7FD',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#3F0082',
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 10,
    color: '#1A0A33',
  },
  primaryButton: {
    backgroundColor: '#3F0082',
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3F0082',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  resendBtn: {
    paddingVertical: 8,
  },
  resendCenterBtn: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  resendText: {
    fontSize: 13,
    color: '#3F0082',
    fontWeight: '700',
  },
  resendTextDisabled: {
    color: '#A396B8',
  },
  changePhoneBtn: {
    paddingVertical: 8,
  },
  changePhoneText: {
    fontSize: 13,
    color: '#6B5E82',
    textDecorationLine: 'underline',
  },
});
