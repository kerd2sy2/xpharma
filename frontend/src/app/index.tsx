import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

export default function HomeScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { user, logout } = useAuth();

  const themeColors = {
    bg: isDark ? '#0A0E1A' : '#F8FAFC',
    card: isDark ? '#141B2D' : '#FFFFFF',
    text: isDark ? '#F8FAFC' : '#0F172A',
    secondaryText: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? '#1E293B' : '#E2E8F0',
    primary: '#2563EB',
    danger: '#EF4444',
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.bg }]}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header Bar */}
        <View style={styles.topBar}>
          <TouchableOpacity 
            style={[styles.logoutBtn, { borderColor: themeColors.border }]} 
            onPress={logout}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={20} color={themeColors.danger} />
            <Text style={[styles.logoutText, { color: themeColors.danger }]}>خروج</Text>
          </TouchableOpacity>

          <View style={styles.brandRow}>
            <Text style={[styles.brandText, { color: themeColors.text }]}>XPharma</Text>
            <View style={styles.brandDot} />
          </View>
        </View>

        {/* User Card */}
        <View style={[styles.userCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.avatarContainer}>
            {user?.photo ? (
              <Image source={{ uri: user.photo }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: themeColors.primary }]}>
                <Text style={styles.avatarLetter}>
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </Text>
              </View>
            )}
            <View style={styles.providerBadge}>
              {user?.provider === 'google' ? (
                <FontAwesome name="google" size={12} color="#EA4335" />
              ) : (
                <Ionicons name="logo-apple" size={12} color="#000000" />
              )}
            </View>
          </View>

          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: themeColors.text }]} numberOfLines={1}>
              {user?.name || 'مستخدم XPharma'}
            </Text>
            <Text style={[styles.userEmail, { color: themeColors.secondaryText }]} numberOfLines={1}>
              {user?.email || 'حساب موثق'}
            </Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {user?.role === 'superadmin' ? 'مدير المنصة' : 'صيدلية / عميل معتمد'}
              </Text>
            </View>
          </View>
        </View>

        {/* Pharma Services Hub */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>الخدمات الدوائية المتاحة</Text>
        </View>

        <View style={styles.servicesGrid}>
          <View style={[styles.serviceCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={[styles.serviceIcon, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="cube-outline" size={24} color="#2563EB" />
            </View>
            <Text style={[styles.serviceTitle, { color: themeColors.text }]}>طلبيات الأدوية</Text>
            <Text style={[styles.serviceDesc, { color: themeColors.secondaryText }]}>
              تصفح مستودعات الأدوية والأسعار الفورية
            </Text>
          </View>

          <View style={[styles.serviceCard, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
            <View style={[styles.serviceIcon, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="receipt-outline" size={24} color="#10B981" />
            </View>
            <Text style={[styles.serviceTitle, { color: themeColors.text }]}>الفواتير والحسابات</Text>
            <Text style={[styles.serviceDesc, { color: themeColors.secondaryText }]}>
              متابعة السندات والمدفوعات الآجلة
            </Text>
          </View>
        </View>

        {/* Server Connection Status */}
        <View style={[styles.statusBox, { backgroundColor: themeColors.card, borderColor: themeColors.border }]}>
          <View style={styles.statusDot} />
          <Text style={[styles.statusText, { color: themeColors.secondaryText }]}>
            متصل بـ XPharma Cloud API (v1)
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  brandRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  brandText: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 13,
    fontWeight: '600',
  },
  userCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarImg: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  avatarPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  providerBadge: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  userInfo: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
  },
  userEmail: {
    fontSize: 13,
  },
  roleBadge: {
    backgroundColor: '#2563EB14',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  roleBadgeText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '600',
  },
  sectionHeader: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'right',
  },
  servicesGrid: {
    gap: 12,
  },
  serviceCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'flex-end',
    gap: 6,
  },
  serviceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  serviceTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  serviceDesc: {
    fontSize: 12,
    textAlign: 'right',
  },
  statusBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 'auto',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
