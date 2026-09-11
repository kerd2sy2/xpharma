import React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { loginWithGoogle, loginWithApple, isAuthenticating, error, clearError } = useAuth();

  // Conditionals per user explicit requirements:
  // Android -> ONLY Google Sign-In
  // iOS -> ONLY Apple Sign-In
  // Web / Others -> Google Sign-In (for browser preview compatibility)
  const showGoogle = Platform.OS === 'android' || Platform.OS === 'web';
  const showApple = Platform.OS === 'ios';

  const themeColors = {
    bg: isDark ? '#0A0E1A' : '#F8FAFC',
    cardBg: isDark ? '#141B2D' : '#FFFFFF',
    textPrimary: isDark ? '#F8FAFC' : '#0F172A',
    textSecondary: isDark ? '#94A3B8' : '#64748B',
    accent: '#2563EB',
    border: isDark ? '#1E293B' : '#E2E8F0',
    googleBtnBg: isDark ? '#1E293B' : '#FFFFFF',
    googleBtnText: isDark ? '#F8FAFC' : '#1E293B',
    googleBorder: isDark ? '#334155' : '#CBD5E1',
    appleBtnBg: isDark ? '#FFFFFF' : '#000000',
    appleBtnText: isDark ? '#000000' : '#FFFFFF',
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.content}>
        {/* Top Decorative / Brand Glow */}
        <View style={styles.headerSection}>
          <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF' }]}>
            <View style={styles.innerIconGlow}>
              <Ionicons name="medical" size={42} color={themeColors.accent} />
            </View>
          </View>

          <Text style={[styles.brandTitle, { color: themeColors.textPrimary }]}>
            XPharma
          </Text>

          <View style={styles.badgeContainer}>
            <Text style={styles.badgeText}>B2B PHARMACEUTICAL NETWORK</Text>
          </View>

          <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
            المنصة الموحدة لإدارة وتوزيع الأدوية
          </Text>
          <Text style={[styles.microText, { color: themeColors.textSecondary }]}>
            ربط ذكي ومباشر بين المستودعات والصيدليات
          </Text>
        </View>

        {/* Error Notification (if any) */}
        {error && (
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={clearError}
            style={styles.errorBox}
          >
            <Ionicons name="alert-circle" size={20} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
          </TouchableOpacity>
        )}

        {/* Auth Action Section (Strictly Social Buttons Only - No Email/Password) */}
        <View style={styles.actionSection}>
          {/* Android: ONLY Google Sign-In */}
          {showGoogle && (
            <TouchableOpacity
              style={[
                styles.socialButton,
                {
                  backgroundColor: themeColors.googleBtnBg,
                  borderColor: themeColors.googleBorder,
                },
                styles.shadow,
              ]}
              onPress={loginWithGoogle}
              disabled={isAuthenticating}
              activeOpacity={0.85}
            >
              {isAuthenticating ? (
                <ActivityIndicator color={themeColors.accent} size="small" />
              ) : (
                <>
                  <View style={styles.buttonIcon}>
                    <FontAwesome name="google" size={22} color="#EA4335" />
                  </View>
                  <Text style={[styles.socialButtonText, { color: themeColors.googleBtnText }]}>
                    تسجيل الدخول بواسطة Google
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* iOS: ONLY Apple Sign-In */}
          {showApple && (
            <TouchableOpacity
              style={[
                styles.socialButton,
                {
                  backgroundColor: themeColors.appleBtnBg,
                  borderColor: themeColors.appleBtnBg,
                },
                styles.shadow,
              ]}
              onPress={loginWithApple}
              disabled={isAuthenticating}
              activeOpacity={0.85}
            >
              {isAuthenticating ? (
                <ActivityIndicator 
                  color={isDark ? '#000000' : '#FFFFFF'} 
                  size="small" 
                />
              ) : (
                <>
                  <View style={styles.buttonIcon}>
                    <Ionicons 
                      name="logo-apple" 
                      size={24} 
                      color={themeColors.appleBtnText} 
                    />
                  </View>
                  <Text style={[styles.socialButtonText, { color: themeColors.appleBtnText }]}>
                    تسجيل الدخول بواسطة Apple
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Footer Security Badge */}
        <View style={styles.footerSection}>
          <View style={styles.securityRow}>
            <Ionicons name="shield-checkmark" size={16} color="#10B981" />
            <Text style={[styles.footerText, { color: themeColors.textSecondary }]}>
              تسجيل دخول آمن ومشفّر 256-bit SSL
            </Text>
          </View>
          <Text style={[styles.copyrightText, { color: themeColors.textSecondary }]}>
            © {new Date().getFullYear()} XPharma Cloud. جميع الحقوق محفوظة
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 36,
  },
  headerSection: {
    alignItems: 'center',
    marginTop: 30,
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#3B82F633',
  },
  innerIconGlow: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  badgeContainer: {
    backgroundColor: '#2563EB1A',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 100,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2563EB33',
  },
  badgeText: {
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 6,
  },
  microText: {
    fontSize: 13,
    textAlign: 'center',
    opacity: 0.85,
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
    marginVertical: 12,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
  actionSection: {
    width: '100%',
    paddingVertical: 20,
    alignItems: 'center',
  },
  socialButton: {
    width: '100%',
    maxWidth: 380,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  shadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  buttonIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  footerSection: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  securityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
  },
  copyrightText: {
    fontSize: 11,
    opacity: 0.6,
  },
});
