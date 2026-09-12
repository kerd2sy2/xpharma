import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/context/AuthContext';
import {
  fetchWarehouses,
  getPharmacySession,
  savePharmacySession,
  VerifyPharmacyResult,
  Warehouse,
} from '@/services/warehouse';
import PharmacyVerifyModal from '@/components/PharmacyVerifyModal';
import WarehousePortalScreen from '@/screens/WarehousePortalScreen';
import XLogo, { XLogoHandle } from '@/components/XLogo';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;
const CARD_GAP = 14;
const PADDING_HORIZONTAL = 16;
const TABLET_CARD_WIDTH = (width - PADDING_HORIZONTAL * 2 - CARD_GAP) / 2;

interface ActivePortalState {
  warehouse: Warehouse;
  token: string;
  pharmacyCode: string;
  pharmacyName: string;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const isDark = false;
  const { user, logout } = useAuth();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Profile Modal State
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  // Verification Modal State
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [selectedWarehouseForModal, setSelectedWarehouseForModal] = useState<Warehouse | null>(null);

  // Active Portal State
  const [activePortal, setActivePortal] = useState<ActivePortalState | null>(null);

  // Logo animation ref
  const headerLogoRef = useRef<XLogoHandle>(null);
  const isNavigatingRef = useRef(false);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationStartTimeRef = useRef(0);

  const navigateWebsite = () => {
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    Linking.openURL('https://xpharma.cloud/').catch((err) => {
      console.warn('Could not open URL:', err);
    });
    // Reset state after 1.5 seconds
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 1500);
  };

  const handleLogoPress = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    animationStartTimeRef.current = Date.now();

    // Trigger full fresh animation immediately without any blank delay
    headerLogoRef.current?.play();

    // The trimmed animation has zero blank frames and finishes in ~1400ms:
    if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current);
    navigationTimeoutRef.current = setTimeout(() => {
      navigateWebsite();
    }, 1450);
  };

  const handleAnimationFinish = () => {
    // Only accept animation finish once at least 1100ms has elapsed
    const elapsed = Date.now() - animationStartTimeRef.current;
    if (isNavigatingRef.current && elapsed >= 1100) {
      navigateWebsite();
    }
  };

  const colors = {
    bg: '#F9F7FD',
    card: '#FFFFFF',
    text: '#1A0A33',
    secondaryText: '#6B5E82',
    border: '#E9E3F3',
    primary: '#3f0082',
    primarySoft: '#3f008215',
    secondary: '#00d780',
    secondarySoft: '#00d78018',
    success: '#00d780',
    successSoft: '#00d78018',
    warning: '#F59E0B',
    danger: '#EF4444',
  };

  /**
   * Sort warehouses:
   * 1. Linked warehouses always at the very top
   * 2. Within each group: sorted alphabetically (A-Z) in Arabic
   */
  const sortWarehouses = (list: Warehouse[]): Warehouse[] => {
    return [...list].sort((a, b) => {
      const aLinked = !!(a.is_linked || a.pharmacy_token || a.linked_pharmacy_code);
      const bLinked = !!(b.is_linked || b.pharmacy_token || b.linked_pharmacy_code);

      if (aLinked && !bLinked) return -1;
      if (!aLinked && bLinked) return 1;

      return (a.name || '').localeCompare(b.name || '', 'ar', { sensitivity: 'base' });
    });
  };

  const loadWarehouses = async () => {
    try {
      const list = await fetchWarehouses(user?.id);

      const updatedList: Warehouse[] = await Promise.all(
        list.map(async (wh) => {
          let session = await getPharmacySession(wh.id);

          // If backend already has this warehouse permanently linked:
          if (wh.is_linked && wh.pharmacy_token) {
            const pharmaSession = {
              token: wh.pharmacy_token,
              pharmacy_code: wh.linked_pharmacy_code || '',
              pharmacy_name: wh.linked_pharmacy_name || '',
              tenant_id: wh.id,
            };
            await savePharmacySession(wh.id, pharmaSession);
            session = pharmaSession;
          }

          if (session && session.token) {
            return {
              ...wh,
              is_linked: true,
              linked_pharmacy_code: session.pharmacy_code,
              linked_pharmacy_name: session.pharmacy_name,
              pharmacy_token: session.token,
            };
          }
          return wh;
        })
      );

      // Deduplicate warehouses so each warehouse has only 1 card on the home screen
      const warehouseMap = new Map<string, Warehouse>();
      for (const wh of updatedList) {
        const key = wh.id || wh.slug || wh.name;
        if (!warehouseMap.has(key)) {
          warehouseMap.set(key, wh);
        } else {
          const existing = warehouseMap.get(key)!;
          if (!existing.is_linked && wh.is_linked) {
            warehouseMap.set(key, { ...existing, ...wh, is_linked: true });
          }
        }
      }
      const uniqueList = Array.from(warehouseMap.values());

      const sortedList = sortWarehouses(uniqueList);
      setWarehouses(sortedList);
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
    let session = await getPharmacySession(wh.id);

    // If session exists locally OR warehouse is marked linked:
    if ((session && session.token) || (wh.is_linked && (wh.pharmacy_token || session?.token))) {
      const activeToken = session?.token || wh.pharmacy_token || '';
      const activeCode = session?.pharmacy_code || wh.linked_pharmacy_code || '';
      const activeName = session?.pharmacy_name || wh.linked_pharmacy_name || '';

      setActivePortal({
        warehouse: wh,
        token: activeToken,
        pharmacyCode: activeCode,
        pharmacyName: activeName,
      });
    } else {
      setSelectedWarehouseForModal(wh);
      setVerifyModalVisible(true);
    }
  };

  const handleVerificationSuccess = async (result: VerifyPharmacyResult) => {
    if (!selectedWarehouseForModal || !result.token) return;

    setVerifyModalVisible(false);

    const updatedWh: Warehouse = {
      ...selectedWarehouseForModal,
      is_linked: true,
      linked_pharmacy_code: result.pharmacy_code,
      linked_pharmacy_name: result.pharmacy_name,
      pharmacy_token: result.token,
    };

    setWarehouses((prev) =>
      sortWarehouses(prev.map((item) => (item.id === updatedWh.id ? updatedWh : item)))
    );

    setActivePortal({
      warehouse: updatedWh,
      token: result.token,
      pharmacyCode: result.pharmacy_code || '',
      pharmacyName: result.pharmacy_name || '',
    });
  };

  // Visual branding with soft luxury tints & distinctive icons
  const getWarehouseVisual = (wh: Warehouse) => {
    const name = (wh.name || '').toLowerCase();
    if (name.includes('sheikh') || name.includes('الشيخ')) {
      return {
        brandColor: '#4A1578',
        accentColor: '#5B1A96',
        softBg: '#F5EDFD',
        softBorder: '#E6D2FB',
        iconName: 'hospital-building' as const,
        brandTag: 'مخزن الشيخ',
      };
    }
    if (name.includes('tabarak') || name.includes('تبارك')) {
      return {
        brandColor: '#00804D',
        accentColor: '#059669',
        softBg: '#ECFDF5',
        softBorder: '#A7F3D0',
        iconName: 'pill' as const,
        brandTag: 'مخزن تبارك',
      };
    }
    if (name.includes('عميرة') || name.includes('abo3mara')) {
      return {
        brandColor: '#312E81',
        accentColor: '#4338CA',
        softBg: '#EEF2FF',
        softBorder: '#C7D2FE',
        iconName: 'flask-round-bottom' as const,
        brandTag: 'مخزن أبو عميرة',
      };
    }
    if (name.includes('x') || name.includes('إكس')) {
      return {
        brandColor: '#3F0082',
        accentColor: '#3F0082',
        softBg: '#F3E8FF',
        softBorder: '#DDD6FE',
        iconName: 'shield-plus' as const,
        brandTag: 'مخزن إكس فارما',
      };
    }
    return {
      brandColor: '#475569',
      accentColor: '#334155',
      softBg: '#F8FAFC',
      softBorder: '#E2E8F0',
      iconName: 'cube-outline' as const,
      brandTag: 'مخزن أدوية',
    };
  };

  // Fallback neutral gradient when a warehouse does not have an uploaded logo yet
  const defaultFallbackGradient: [string, string, string] = ['#151922', '#222A38', '#181D26'];

  // Handle Android hardware/gesture back button:
  // Close open modals if any, and if on main screen, exit the app
  useEffect(() => {
    const onBackPress = () => {
      if (activePortal) {
        // Handled by WarehousePortalScreen
        return false;
      }
      if (verifyModalVisible) {
        setVerifyModalVisible(false);
        setSelectedWarehouseForModal(null);
        return true;
      }
      if (profileModalVisible) {
        setProfileModalVisible(false);
        return true;
      }
      // On main screen: allow default Android behavior to exit the app
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [activePortal, verifyModalVisible, profileModalVisible]);

  if (activePortal) {
    return (
      <WarehousePortalScreen
        warehouse={activePortal.warehouse}
        token={activePortal.token}
        pharmacyCode={activePortal.pharmacyCode}
        pharmacyName={activePortal.pharmacyName}
        onBack={() => {
          setActivePortal(null);
          loadWarehouses();
        }}
      />
    );
  }

  // Safe area padding for Android status bar
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={colors.bg}
        translucent={false}
      />

      {/* Warehouses List: Full-screen scroll behind fixed header */}
      <FlatList
        key={isTablet ? 'tablet-grid' : 'phone-list'}
        data={warehouses}
        keyExtractor={(item) => item.id}
        numColumns={isTablet ? 2 : 1}
        columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: topInset + 60 + 44 },
        ]}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            progressViewOffset={topInset + 60}
          />
        }
        renderItem={({ item }) => {
          const visual = getWarehouseVisual(item);
          const logoUri = item.logo_url
            ? item.logo_url.startsWith('http')
              ? item.logo_url
              : `https://xpharma.cloud${item.logo_url}`
            : null;

          const categoryText = item.category || 'مخزن أدوية';
          const isPharma = categoryText.includes('أدوية') || categoryText.includes('ادوية');

          return (
            <TouchableOpacity
              style={[
                styles.appStoreBannerCard,
                isTablet && { width: TABLET_CARD_WIDTH, marginBottom: CARD_GAP },
              ]}
              onPress={() => handleWarehousePress(item)}
              activeOpacity={0.9}
            >
              {/* 1. Solid Dark Foundation */}
              <View style={[StyleSheet.absoluteFill, { backgroundColor: '#13161D' }]} />

              {/* 2. Automatic Ambient Logo Blur (Derives card background directly from the logo) */}
              {logoUri ? (
                <Image
                  source={{ uri: logoUri }}
                  style={styles.ambientBlurImage}
                  blurRadius={Platform.select({ ios: 65, android: 25, default: 45 })}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={defaultFallbackGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              )}

              {/* 3. Smooth Seamless Contrast Overlay */}
              <LinearGradient
                colors={['rgba(10, 14, 22, 0.42)', 'rgba(10, 14, 22, 0.2)', 'rgba(10, 14, 22, 0.48)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />

              {/* 4. Card Content: Name, then Status & Category side-by-side (No boxes, No borders) */}
              <View style={styles.bannerContentRow}>
                {/* Details Column (Right in RTL layout) */}
                <View style={styles.bannerDetailsCol}>
                  {/* Warehouse Name */}
                  <Text style={styles.bannerTitleText} numberOfLines={1}>
                    {item.name}
                  </Text>

                  {/* Combined Status & Category Row (Status first, then Category next to it) */}
                  <View style={styles.metaRow}>
                    {/* 1. Status: تم الربط / ربط الآن */}
                    {item.is_linked ? (
                      <View style={styles.statusItem}>
                        <Ionicons name="checkmark-circle" size={14} color="#34D399" />
                        <Text style={styles.statusTextLinked}>تم الربط</Text>
                      </View>
                    ) : (
                      <View style={styles.statusItem}>
                        <Ionicons name="link" size={13} color="rgba(255, 255, 255, 0.85)" />
                        <Text style={styles.statusTextUnlinked}>ربط الآن</Text>
                      </View>
                    )}

                    {/* Dot Separator */}
                    <Text style={styles.metaDot}>•</Text>

                    {/* 2. Warehouse Category */}
                    <View style={styles.categoryItem}>
                      <MaterialCommunityIcons
                        name={isPharma ? 'pill' : 'cube-outline'}
                        size={13}
                        color="rgba(255, 255, 255, 0.75)"
                      />
                      <Text style={styles.categoryText} numberOfLines={1}>
                        {categoryText}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Right: iOS App Icon Squircle */}
                <View style={styles.appIconSquircle}>
                  {logoUri ? (
                    <Image
                      source={{ uri: logoUri }}
                      style={styles.appIconImg}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={[styles.appIconFallback, { backgroundColor: visual.softBg }]}>
                      <MaterialCommunityIcons name={visual.iconName} size={32} color={visual.accentColor} />
                    </View>
                  )}
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
                بنحمل بيانات المخازن...
              </Text>
            </View>
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="cube-outline" size={42} color={colors.secondaryText} />
              <Text style={[styles.emptyText, { color: colors.text }]}>مفيش مخازن متاحة حالياً</Text>
            </View>
          )
        }
      />

      {/* Fixed Top Header (Seamless, No Box, Permanent at Top) */}
      <View style={[styles.fixedHeaderArea, { paddingTop: topInset, backgroundColor: colors.bg }]}>
        <View style={styles.topBar}>
          {/* Right side: Clickable Logo & Brand */}
          <TouchableOpacity
            style={styles.brandRow}
            onPress={handleLogoPress}
            activeOpacity={0.7}
          >
            <XLogo
              ref={headerLogoRef}
              size={48}
              scale={1.8}
              speed={1.0}
              autoPlay={false}
              loop={false}
              onAnimationFinish={handleAnimationFinish}
            />
            <Text style={[styles.brandText, { color: '#3f0082' }]}>فارما</Text>
          </TouchableOpacity>

          {/* Left side: Avatar opens Profile Modal */}
          <TouchableOpacity
            style={styles.avatarButton}
            onPress={() => setProfileModalVisible(true)}
            activeOpacity={0.8}
          >
            {user?.photo ? (
              <Image source={{ uri: user.photo }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: colors.primary }]}>
                <Text style={styles.avatarLetter}>
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'ص'}
                </Text>
              </View>
            )}
            <View style={styles.onlineStatusDot} />
          </TouchableOpacity>
        </View>

        {/* Soft bottom feathering transition (Ultra-smooth 9-stop easing curve) */}
        <LinearGradient
          colors={[
            colors.bg,
            'rgba(249, 247, 253, 0.98)',
            'rgba(249, 247, 253, 0.90)',
            'rgba(249, 247, 253, 0.76)',
            'rgba(249, 247, 253, 0.56)',
            'rgba(249, 247, 253, 0.35)',
            'rgba(249, 247, 253, 0.16)',
            'rgba(249, 247, 253, 0.04)',
            'rgba(249, 247, 253, 0)',
          ]}
          style={styles.featherEdge}
          pointerEvents="none"
        />
      </View>

      {/* Verification Bottom Sheet Modal */}
      <PharmacyVerifyModal
        visible={verifyModalVisible}
        warehouse={selectedWarehouseForModal}
        onClose={() => {
          setVerifyModalVisible(false);
          setSelectedWarehouseForModal(null);
        }}
        onSuccess={handleVerificationSuccess}
      />

      {/* Profile Modal */}
      <Modal
        visible={profileModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setProfileModalVisible(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Close Button on Left */}
                <TouchableOpacity
                  style={[styles.closeIconBtn, { borderColor: colors.border }]}
                  onPress={() => setProfileModalVisible(false)}
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </TouchableOpacity>

                {/* Avatar */}
                <View style={styles.profileAvatarContainer}>
                  {user?.photo ? (
                    <Image source={{ uri: user.photo }} style={styles.profileAvatarImg} />
                  ) : (
                    <View style={[styles.profileAvatarPlaceholder, { backgroundColor: colors.primary }]}>
                      <Text style={styles.profileAvatarLetter}>
                        {user?.name ? user.name.charAt(0).toUpperCase() : 'ص'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.profileBadgeIcon}>
                    {user?.provider === 'google' ? (
                      <FontAwesome name="google" size={14} color="#EA4335" />
                    ) : (
                      <Ionicons name="logo-apple" size={14} color="#000000" />
                    )}
                  </View>
                </View>

                {/* Info in Egyptian Arabic */}
                <Text style={[styles.profileName, { color: colors.text }]}>
                  {user?.name || 'دكتور صيدلي'}
                </Text>
                <Text style={[styles.profileEmail, { color: colors.secondaryText }]}>
                  {user?.email || 'حساب مفعل'}
                </Text>

                <View style={[styles.profileRoleBadge, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.profileRoleText, { color: colors.primary }]}>
                    صيدلية معتمدة
                  </Text>
                </View>

                <View style={[styles.profileDivider, { backgroundColor: colors.border }]} />

                {/* Security Row */}
                <View style={styles.profileSecurityRow}>
                  <Ionicons name="shield-checkmark" size={16} color={colors.success} />
                  <Text style={[styles.profileSecurityText, { color: colors.secondaryText }]}>
                    اتصال آمن ومشفر 100%
                  </Text>
                </View>

                {/* Logout Button */}
                <TouchableOpacity
                  style={[styles.profileLogoutBtn, { borderColor: colors.danger }]}
                  onPress={async () => {
                    setProfileModalVisible(false);
                    await logout();
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                  <Text style={[styles.profileLogoutText, { color: colors.danger }]}>
                    تسجيل خروج
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  fixedHeaderArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  topBar: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: PADDING_HORIZONTAL,
    paddingTop: 8,
    paddingBottom: 6,
  },
  featherEdge: {
    position: 'absolute',
    bottom: -38,
    left: 0,
    right: 0,
    height: 38,
  },
  brandRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginRight: -10,
    transform: [{ translateY: 3.5 }],
    color: '#3f0082',
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00d780',
  },
  avatarButton: {
    position: 'relative',
  },
  avatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#00d780',
  },
  avatarPlaceholder: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  onlineStatusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#00d780',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: PADDING_HORIZONTAL,
    paddingTop: 4,
    paddingBottom: 36,
  },
  columnWrapper: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: CARD_GAP,
  },

  // App Store Panoramic Banner Card (Automatic dynamic logo-derived background)
  appStoreBannerCard: {
    borderRadius: 22,
    marginBottom: 14,
    minHeight: 104,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#13161D',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  ambientBlurImage: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
    transform: [{ scale: 2.0 }],
    opacity: 0.9,
  },
  bannerContentRow: {
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 14,
  },
  appIconSquircle: {
    width: 70,
    height: 70,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconImg: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  appIconFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerDetailsCol: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 6,
  },
  bannerTitleText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  metaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 7,
  },
  statusItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  statusTextLinked: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statusTextUnlinked: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 13,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  metaDot: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 13,
  },
  categoryItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  categoryText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12.5,
    fontWeight: '600',
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
    padding: 40,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  profileCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    position: 'relative',
    gap: 6,
  },
  closeIconBtn: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarContainer: {
    position: 'relative',
    marginTop: 8,
    marginBottom: 8,
  },
  profileAvatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  profileAvatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarLetter: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
  },
  profileBadgeIcon: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  profileEmail: {
    fontSize: 13,
    textAlign: 'center',
  },
  profileRoleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 4,
  },
  profileRoleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  profileDivider: {
    height: 1,
    width: '100%',
    marginVertical: 10,
  },
  profileSecurityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  profileSecurityText: {
    fontSize: 12,
    fontWeight: '500',
  },
  profileLogoutBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 4,
  },
  profileLogoutText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
