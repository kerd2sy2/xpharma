import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import {
  clearPharmacySession,
  fetchWarehouses,
  getPharmacySession,
  savePharmacySession,
  VerifyPharmacyResult,
  Warehouse,
} from '@/services/warehouse';
import PharmacyVerifyModal from '@/components/PharmacyVerifyModal';
import WarehousePortalScreen from '@/screens/WarehousePortalScreen';

interface ActivePortalState {
  warehouse: Warehouse;
  token: string;
  pharmacyCode: string;
  pharmacyName: string;
}

export default function HomeScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { user, logout } = useAuth();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Verification modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedWarehouseForModal, setSelectedWarehouseForModal] = useState<Warehouse | null>(null);

  // Active portal state (when pharmacy is verified for a warehouse)
  const [activePortal, setActivePortal] = useState<ActivePortalState | null>(null);

  const colors = {
    bg: isDark ? '#0A0E1A' : '#F8FAFC',
    card: isDark ? '#141B2D' : '#FFFFFF',
    text: isDark ? '#F8FAFC' : '#0F172A',
    secondaryText: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? '#1E293B' : '#E2E8F0',
    primary: '#2563EB',
    primarySoft: isDark ? '#1E293B' : '#EFF6FF',
    success: '#10B981',
    successSoft: isDark ? '#064E3B44' : '#ECFDF5',
    warning: '#F59E0B',
    danger: '#EF4444',
  };

  const loadWarehouses = async () => {
    try {
      const list = await fetchWarehouses(user?.id);

      // Check local storage for existing verified tokens for each warehouse
      const updatedList: Warehouse[] = await Promise.all(
        list.map(async (wh) => {
          const session = await getPharmacySession(wh.id);
          if (session && session.token) {
            return {
              ...wh,
              is_linked: true,
              linked_pharmacy_code: session.pharmacy_code,
              linked_pharmacy_name: session.pharmacy_name,
            };
          }
          return wh;
        })
      );

      setWarehouses(updatedList);
    } catch (e) {
      console.error('Failed to load warehouses:', e);
    } finally {
      setLoadingWarehouses(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadWarehouses();
  }, [user?.id]);

  const onRefresh = () => {
    setRefreshing(true);
    loadWarehouses();
  };

  const handleWarehousePress = async (wh: Warehouse) => {
    // Check if we have a valid token locally
    const session = await getPharmacySession(wh.id);

    if (session && session.token) {
      // Already verified -> Open portal directly!
      setActivePortal({
        warehouse: wh,
        token: session.token,
        pharmacyCode: session.pharmacy_code,
        pharmacyName: session.pharmacy_name,
      });
    } else {
      // First time click -> Open bottom sheet modal for code & phone
      setSelectedWarehouseForModal(wh);
      setModalVisible(true);
    }
  };

  const handleVerificationSuccess = async (result: VerifyPharmacyResult) => {
    if (!selectedWarehouseForModal || !result.token) return;

    setModalVisible(false);

    const updatedWh: Warehouse = {
      ...selectedWarehouseForModal,
      is_linked: true,
      linked_pharmacy_code: result.pharmacy_code,
      linked_pharmacy_name: result.pharmacy_name,
    };

    // Update list state
    setWarehouses((prev) =>
      prev.map((item) => (item.id === updatedWh.id ? updatedWh : item))
    );

    // Open portal immediately!
    setActivePortal({
      warehouse: updatedWh,
      token: result.token,
      pharmacyCode: result.pharmacy_code || '',
      pharmacyName: result.pharmacy_name || '',
    });
  };

  const handleUnlink = async (tenantId: string) => {
    await clearPharmacySession(tenantId);
    setWarehouses((prev) =>
      prev.map((item) =>
        item.id === tenantId
          ? {
              ...item,
              is_linked: false,
              linked_pharmacy_code: '',
              linked_pharmacy_name: '',
            }
          : item
      )
    );
    setActivePortal(null);
  };

  // If a warehouse portal is open, render the portal screen
  if (activePortal) {
    return (
      <WarehousePortalScreen
        warehouse={activePortal.warehouse}
        token={activePortal.token}
        pharmacyCode={activePortal.pharmacyCode}
        pharmacyName={activePortal.pharmacyName}
        onBack={() => setActivePortal(null)}
        onUnlink={() => handleUnlink(activePortal.warehouse.id)}
      />
    );
  }

  // Get decorative theme for warehouse card
  const getWarehouseTheme = (wh: Warehouse) => {
    const nameLower = (wh.name || '').toLowerCase();
    if (nameLower.includes('sheikh') || nameLower.includes('الشيخ')) {
      return {
        color: '#2563EB',
        bgSoft: isDark ? '#1E293B' : '#EFF6FF',
        iconName: 'business' as const,
        letter: 'S',
      };
    }
    if (nameLower.includes('tabarak') || nameLower.includes('تبارك')) {
      return {
        color: '#059669',
        bgSoft: isDark ? '#064E3B44' : '#ECFDF5',
        iconName: 'medical' as const,
        letter: 'T',
      };
    }
    if (nameLower.includes('عميرة')) {
      return {
        color: '#7C3AED',
        bgSoft: isDark ? '#3B076444' : '#F5F3FF',
        iconName: 'flask' as const,
        letter: 'A',
      };
    }
    return {
      color: '#0284C7',
      bgSoft: isDark ? '#082F4944' : '#F0F9FF',
      iconName: 'cube' as const,
      letter: wh.name ? wh.name.charAt(0) : 'W',
    };
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Top Header Bar */}
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: colors.border }]}
          onPress={logout}
          activeOpacity={0.8}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.danger} />
          <Text style={[styles.logoutText, { color: colors.danger }]}>خروج</Text>
        </TouchableOpacity>

        <View style={styles.brandRow}>
          <Text style={[styles.brandText, { color: colors.text }]}>XPharma</Text>
          <View style={styles.brandDot} />
        </View>
      </View>

      <FlatList
        data={warehouses}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.headerComponent}>
            {/* Pharmacist Welcome Profile Card */}
            <View style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.avatarContainer}>
                {user?.photo ? (
                  <Image source={{ uri: user.photo }} style={styles.avatarImg} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                    <Text style={styles.avatarLetter}>
                      {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                    </Text>
                  </View>
                )}
                <View style={styles.providerBadge}>
                  {user?.provider === 'google' ? (
                    <FontAwesome name="google" size={11} color="#EA4335" />
                  ) : (
                    <Ionicons name="logo-apple" size={11} color="#000000" />
                  )}
                </View>
              </View>

              <View style={styles.userInfo}>
                <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                  {user?.name || 'صيدلي XPharma'}
                </Text>
                <Text style={[styles.userEmail, { color: colors.secondaryText }]} numberOfLines={1}>
                  {user?.email || 'حساب موثق'}
                </Text>
                <View style={[styles.roleBadge, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.roleBadgeText, { color: colors.primary }]}>
                    بوابة ربط واستعلام الصيدليات
                  </Text>
                </View>
              </View>
            </View>

            {/* Warehouse Section Header */}
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionSubtitle, { color: colors.secondaryText }]}>
                اختر المستودع لفتح الفواتير وسندات القبض وكشف الحساب
              </Text>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>مستودعات الأدوية المتاحة</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const theme = getWarehouseTheme(item);
          return (
            <TouchableOpacity
              style={[
                styles.warehouseCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => handleWarehousePress(item)}
              activeOpacity={0.85}
            >
              {/* Left Action / Status */}
              <View style={styles.cardLeftCol}>
                {item.is_linked ? (
                  <View style={[styles.linkBadge, { backgroundColor: colors.successSoft }]}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <Text style={[styles.linkBadgeText, { color: colors.success }]}>
                      مربوط ({item.linked_pharmacy_code})
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.linkBadge, { backgroundColor: colors.primarySoft }]}>
                    <Ionicons name="key-outline" size={13} color={colors.primary} />
                    <Text style={[styles.linkBadgeText, { color: colors.primary }]}>
                      اضغط للربط
                    </Text>
                  </View>
                )}
                <Ionicons
                  name="chevron-back"
                  size={18}
                  color={colors.secondaryText}
                  style={styles.chevronIcon}
                />
              </View>

              {/* Right: Info & Logo */}
              <View style={styles.cardRightCol}>
                <View style={styles.whInfoCol}>
                  <Text style={[styles.whName, { color: colors.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.whSlug, { color: colors.secondaryText }]} numberOfLines={1}>
                    {item.is_linked && item.linked_pharmacy_name
                      ? item.linked_pharmacy_name
                      : `مستودع أدوية نشط • المعرّف: ${item.slug}`}
                  </Text>
                </View>

                {/* Warehouse Logo Avatar */}
                <View style={[styles.whLogoAvatar, { backgroundColor: theme.bgSoft }]}>
                  <Ionicons name={theme.iconName} size={24} color={theme.color} />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          loadingWarehouses ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.secondaryText }]}>
                جارٍ فحص مستودعات الأدوية النشطة...
              </Text>
            </View>
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="alert-circle-outline" size={38} color={colors.secondaryText} />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                لا توجد مستودعات متاحة حالياً
              </Text>
            </View>
          )
        }
      />

      {/* Bottom Sheet Verification Modal */}
      <PharmacyVerifyModal
        visible={modalVisible}
        warehouse={selectedWarehouseForModal}
        onClose={() => {
          setModalVisible(false);
          setSelectedWarehouseForModal(null);
        }}
        onSuccess={handleVerificationSuccess}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  brandText: {
    fontSize: 20,
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
    flexDirection: 'row-reverse',
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
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 30,
  },
  headerComponent: {
    gap: 16,
    marginBottom: 6,
  },
  userCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    gap: 14,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
  },
  providerBadge: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    width: 18,
    height: 18,
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
    fontSize: 16,
    fontWeight: '700',
  },
  userEmail: {
    fontSize: 12,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    alignItems: 'flex-end',
    gap: 4,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  warehouseCard: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },
  cardRightCol: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  whLogoAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  whInfoCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  whName: {
    fontSize: 16,
    fontWeight: '800',
  },
  whSlug: {
    fontSize: 12,
  },
  cardLeftCol: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  linkBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  linkBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chevronIcon: {
    marginRight: -4,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
