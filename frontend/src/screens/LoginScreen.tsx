import React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import XLogo from '@/components/XLogo';

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { loginWithGoogle, loginWithApple, isAuthenticating, error, clearError } = useAuth();

  const showGoogle = Platform.OS === 'android' || Platform.OS === 'web';
  const showApple = Platform.OS === 'ios';

  const themeColors = {
    bg: isDark ? '#0E051D' : '#F9F7FD',
    cardBg: isDark ? '#190C30' : '#FFFFFF',
    textPrimary: isDark ? '#FBF9FF' : '#1A0A33',
    textSecondary: isDark ? '#AC9DC2' : '#6B5E82',
    primary: '#3f0082',
    accent: '#00d780',
    border: isDark ? '#2E184F' : '#E9E3F3',
    googleBtnBg: isDark ? '#190C30' : '#FFFFFF',
    googleBtnText: isDark ? '#FBF9FF' : '#1A0A33',
    googleBorder: isDark ? '#3F226E' : '#D5CBE6',
    appleBtnBg: isDark ? '#FFFFFF' : '#000000',
    appleBtnText: isDark ? '#000000' : '#FFFFFF',
  };

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.bg, paddingTop: topInset }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={themeColors.bg}
        translucent={false}
      />

      <View style={styles.content}>
        {/* Massive Fullscreen Animated Logo - No Text */}
        <View style={styles.logoSection}>
          <XLogo
            width={width}
            height={Math.min(height * 0.7, 560)}
            resizeMode="contain"
            loop={true}
          />
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

        {/* Auth Action Section */}
        <View style={styles.actionSection}>
          {/* Android: ONLY Google Sign-In */}
          {showGoogle && (
            <TouchableOpacity
              style={[
                styles.socialButton,
                {
                  backgroundColor: themeColors.googleBtnBg,
                  borderColor: isDark ? '#3f0082' : '#E0D7F0',
                },
                styles.shadow,
              ]}
              onPress={loginWithGoogle}
              disabled={isAuthenticating}
              activeOpacity={0.85}
            >
              {isAuthenticating ? (
                <ActivityIndicator color={themeColors.primary} size="small" />
              ) : (
                <>
                  <View style={styles.buttonIcon}>
                    <FontAwesome name="google" size={22} color="#EA4335" />
                  </View>
                  <Text style={[styles.socialButtonText, { color: themeColors.googleBtnText }]}>
                    تسجيل الدخول بحساب Google
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
                    تسجيل الدخول بحساب Apple
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
  },
  logoSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingTop: 10,
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
    marginHorizontal: 24,
    marginBottom: 12,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
  actionSection: {
    width: '100%',
    paddingHorizontal: 24,
    paddingBottom: 20,
    alignItems: 'center',
  },
  socialButton: {
    width: '100%',
    maxWidth: 380,
    height: 56,
    borderRadius: 18,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  shadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  buttonIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialButtonText: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
});
