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

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const PADDING_HORIZONTAL = 16;
const CARD_WIDTH = (width - PADDING_HORIZONTAL * 2 - CARD_GAP) / 2;
const ORDER_STORAGE_KEY = 'xpharma_warehouses_custom_order';

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
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Profile Modal State
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  // Sorting / Reordering Modal State
  const [sortModalVisible, setSortModalVisible] = useState(false);

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
   * Sort warehouses according to saved custom order
   */
  const applyCustomOrder = async (list: Warehouse[]): Promise<Warehouse[]> => {
    try {
      const savedOrderStr = await SecureStore.getItemAsync(ORDER_STORAGE_KEY);
      if (!savedOrderStr) return list;

      const savedOrder: string[] = JSON.parse(savedOrderStr);
      if (!Array.isArray(savedOrder) || savedOrder.length === 0) return list;

      const orderMap = new Map<string, number>();
      savedOrder.forEach((id, idx) => orderMap.set(id, idx));

      return [...list].sort((a, b) => {
        const orderA = orderMap.has(a.id) ? orderMap.get(a.id)! : 9999;
        const orderB = orderMap.has(b.id) ? orderMap.get(b.id)! : 9999;
        return orderA - orderB;
      });
    } catch (e) {
      return list;
    }
  };

  const saveCustomOrder = async (list: Warehouse[]) => {
    try {
      const idOrder = list.map((w) => w.id);
      await SecureStore.setItemAsync(ORDER_STORAGE_KEY, JSON.stringify(idOrder));
    } catch (e) {
      console.warn('Failed to save warehouse order:', e);
    }
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

      const orderedList = await applyCustomOrder(uniqueList);
      setWarehouses(orderedList);
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
      prev.map((item) => (item.id === updatedWh.id ? updatedWh : item))
    );

    setActivePortal({
      warehouse: updatedWh,
      token: result.token,
      pharmacyCode: result.pharmacy_code || '',
      pharmacyName: result.pharmacy_name || '',
    });
  };

  const moveWarehouse = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= warehouses.length) return;

    const newList = [...warehouses];
    const temp = newList[index];
    newList[index] = newList[newIndex];
    newList[newIndex] = temp;

    setWarehouses(newList);
    saveCustomOrder(newList);
  };

  const sortPreset = (type: 'linkedFirst' | 'alphabetical') => {
    let sorted = [...warehouses];
    if (type === 'linkedFirst') {
      sorted.sort((a, b) => (b.is_linked ? 1 : 0) - (a.is_linked ? 1 : 0));
    } else if (type === 'alphabetical') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    }
    setWarehouses(sorted);
    saveCustomOrder(sorted);
    setSortModalVisible(false);
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
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset }]}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={colors.bg}
        translucent={false}
      />

      {/* Top Header: Seamless with page background (no card, no border) */}
      <View style={styles.topBar}>
        {/* Right side: Clickable Logo & Brand -> animates on press and opens website after finishing */}
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

      {/* Sub-header Bar: Title on RIGHT, Controls on LEFT */}
      <View style={styles.controlsBar}>
        {/* Right: Section Title */}
        <View style={styles.sectionHeaderCol}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>مخازن الأدوية</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.secondaryText }]}>
            {warehouses.length} {warehouses.length === 1 ? 'مخزن متاح' : 'مخازن متاحة'}
          </Text>
        </View>

        {/* Left: Actions (View Mode Toggle + Reorder) */}
        <View style={styles.controlsActionsRow}>
          <TouchableOpacity
            style={[styles.controlIconBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => setViewMode((prev) => (prev === 'list' ? 'grid' : 'list'))}
            activeOpacity={0.8}
          >
            <Ionicons
              name={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
              size={17}
              color={colors.primary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.reorderBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={() => setSortModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="swap-vertical" size={15} color={colors.primary} />
            <Text style={[styles.reorderBtnText, { color: colors.primary }]}>ترتيب</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Warehouses List / Grid */}
      <FlatList
        key={viewMode}
        data={warehouses}
        keyExtractor={(item) => item.id}
        numColumns={viewMode === 'grid' ? 2 : 1}
        columnWrapperStyle={viewMode === 'grid' ? styles.columnWrapper : undefined}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        renderItem={({ item }) => {
          const visual = getWarehouseVisual(item);

          if (viewMode === 'grid') {
            return (
              <TouchableOpacity
                style={[
                  styles.modernGridCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
                onPress={() => handleWarehousePress(item)}
                activeOpacity={0.88}
              >
                {/* Top Status & Icon Row */}
                <View style={styles.gridCardTopRow}>
                  {item.is_linked ? (
                    <View style={styles.gridLinkedBadge}>
                      <Ionicons name="checkmark-circle" size={12} color="#059669" />
                      <Text style={styles.gridLinkedBadgeText}>تم الربط</Text>
                    </View>
                  ) : (
                    <View style={[styles.gridUnlinkedBadge, { backgroundColor: colors.primarySoft }]}>
                      <Text style={[styles.gridUnlinkedBadgeText, { color: colors.primary }]}>ربط</Text>
                    </View>
                  )}

                  <View
                    style={[
                      styles.gridIconCircle,
                      { backgroundColor: visual.softBg, borderColor: visual.softBorder },
                    ]}
                  >
                    <MaterialCommunityIcons name={visual.iconName} size={24} color={visual.accentColor} />
                  </View>
                </View>

                {/* Warehouse Name */}
                <Text style={[styles.gridWarehouseName, { color: colors.text }]} numberOfLines={2}>
                  {item.name}
                </Text>

                {/* Footer with Tag & Indicator */}
                <View style={[styles.gridCardFooter, { borderTopColor: colors.border }]}>
                  <Text style={[styles.gridBrandTag, { color: colors.secondaryText }]}>
                    {visual.brandTag}
                  </Text>
                  <Ionicons
                    name="chevron-back"
                    size={15}
                    color={item.is_linked ? '#059669' : colors.secondaryText}
                  />
                </View>
              </TouchableOpacity>
            );
          }

          // Default: Full-Width Luxury Card
          return (
            <TouchableOpacity
              style={[
                styles.luxuryCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => handleWarehousePress(item)}
              activeOpacity={0.88}
            >
              {/* Subtle Decorative Right Accent Bar */}
              <View
                style={[
                  styles.luxuryCardAccentBar,
                  { backgroundColor: item.is_linked ? '#00d780' : visual.accentColor },
                ]}
              />

              <View style={styles.luxuryCardContent}>
                {/* Main Row */}
                <View style={styles.luxuryHeaderRow}>
                  {/* Right Side (RTL): Elegant Brand Icon */}
                  <View
                    style={[
                      styles.luxuryIconBox,
                      { backgroundColor: visual.softBg, borderColor: visual.softBorder },
                    ]}
                  >
                    <MaterialCommunityIcons name={visual.iconName} size={28} color={visual.accentColor} />
                  </View>

                  {/* Center: Details */}
                  <View style={styles.luxuryTitleCol}>
                    <Text style={[styles.luxuryWarehouseName, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>

                    <View style={styles.luxuryMetaRow}>
                      <View style={[styles.brandTagPill, { backgroundColor: colors.bg }]}>
                        <Text style={[styles.brandTagPillText, { color: colors.secondaryText }]}>
                          {visual.brandTag}
                        </Text>
                      </View>
                      {item.is_linked ? (
                        <View style={styles.liveStatusRow}>
                          <View style={styles.liveGreenDot} />
                          <Text style={styles.liveGreenText}>حساب متصل ومحدث</Text>
                        </View>
                      ) : (
                        <Text style={[styles.inactiveMetaText, { color: colors.secondaryText }]}>
                          جاهز للربط الفوري
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Left Side: Action Pill & Arrow */}
                  <View style={styles.luxuryActionCol}>
                    {item.is_linked ? (
                      <View style={styles.linkedActionPill}>
                        <Text style={styles.linkedActionPillText}>تم الربط</Text>
                        <Ionicons name="checkmark-circle" size={13} color="#059669" />
                      </View>
                    ) : (
                      <View style={[styles.connectActionPill, { backgroundColor: colors.primarySoft }]}>
                        <Text style={[styles.connectActionPillText, { color: colors.primary }]}>
                          اضغط للربط
                        </Text>
                        <Ionicons name="link-outline" size={13} color={colors.primary} />
                      </View>
                    )}
                    <Ionicons
                      name="chevron-back"
                      size={16}
                      color={colors.secondaryText}
                      style={{ marginTop: 4 }}
                    />
                  </View>
                </View>

                {/* Bottom Footer: Feature Badges Strip */}
                <View style={[styles.luxuryCardFooter, { borderTopColor: '#F1F5F9' }]}>
                  <View style={styles.footerFeaturesList}>
                    <View style={styles.featureItem}>
                      <Ionicons name="receipt-outline" size={12} color={colors.secondaryText} />
                      <Text style={[styles.featureItemText, { color: colors.secondaryText }]}>فواتير</Text>
                    </View>
                    <Text style={styles.featureDot}>•</Text>
                    <View style={styles.featureItem}>
                      <Ionicons name="refresh-outline" size={12} color={colors.secondaryText} />
                      <Text style={[styles.featureItemText, { color: colors.secondaryText }]}>مرتجعات</Text>
                    </View>
                    <Text style={styles.featureDot}>•</Text>
                    <View style={styles.featureItem}>
                      <Ionicons name="cash-outline" size={12} color={colors.secondaryText} />
                      <Text style={[styles.featureItemText, { color: colors.secondaryText }]}>نقدية</Text>
                    </View>
                    <Text style={styles.featureDot}>•</Text>
                    <View style={styles.featureItem}>
                      <Ionicons name="document-text-outline" size={12} color={colors.secondaryText} />
                      <Text style={[styles.featureItemText, { color: colors.secondaryText }]}>كشف حساب</Text>
                    </View>
                  </View>

                  <View style={styles.portalEnterHintRow}>
                    <Text
                      style={[
                        styles.portalEnterHintText,
                        { color: item.is_linked ? colors.primary : colors.secondaryText },
                      ]}
                    >
                      {item.is_linked ? 'فتح اللوحة' : 'ربط الحساب'}
                    </Text>
                    <Ionicons
                      name="arrow-back"
                      size={12}
                      color={item.is_linked ? colors.primary : colors.secondaryText}
                    />
                  </View>
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

      {/* Sorting & Reordering Modal */}
      <Modal
        visible={sortModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setSortModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setSortModalVisible(false)}>
          <View style={styles.modalOverlayBottom}>
            <TouchableWithoutFeedback>
              <View style={[styles.sortSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Drag handle */}
                <View style={styles.sheetHandleContainer}>
                  <View style={[styles.sheetHandle, { backgroundColor: '#CBD5E1' }]} />
                </View>

                <View style={styles.sortHeader}>
                  <Text style={[styles.sortTitle, { color: colors.text }]}>ترتيب المخازن</Text>
                  <Text style={[styles.sortSubtitle, { color: colors.secondaryText }]}>
                    رتب المخازن زي ما تحب وهيتحفظ ترتيبك تلقائي
                  </Text>
                </View>

                {/* Quick Presets */}
                <View style={styles.presetsRow}>
                  <TouchableOpacity
                    style={[styles.presetBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                    onPress={() => sortPreset('linkedFirst')}
                  >
                    <Ionicons name="checkmark-done" size={15} color={colors.success} />
                    <Text style={[styles.presetBtnText, { color: colors.text }]}>المربوطة الأول</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.presetBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                    onPress={() => sortPreset('alphabetical')}
                  >
                    <Ionicons name="text" size={15} color={colors.primary} />
                    <Text style={[styles.presetBtnText, { color: colors.text }]}>أبجدي (أ - ي)</Text>
                  </TouchableOpacity>
                </View>

                {/* Manual Reorder List */}
                <Text style={[styles.reorderListLabel, { color: colors.secondaryText }]}>
                  ترتيب يدوي (حرك بالأسهم فوق وتحت):
                </Text>

                <ScrollView style={styles.reorderScroll} showsVerticalScrollIndicator={false}>
                  {warehouses.map((wh, idx) => (
                    <View
                      key={wh.id}
                      style={[styles.reorderItem, { backgroundColor: colors.bg, borderColor: colors.border }]}
                    >
                      {/* Arrow Buttons on Left */}
                      <View style={styles.arrowsCol}>
                        <TouchableOpacity
                          style={[styles.arrowBtn, idx === 0 && styles.disabledArrow]}
                          onPress={() => moveWarehouse(idx, 'up')}
                          disabled={idx === 0}
                        >
                          <Ionicons name="chevron-up" size={18} color={idx === 0 ? colors.border : colors.primary} />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.arrowBtn, idx === warehouses.length - 1 && styles.disabledArrow]}
                          onPress={() => moveWarehouse(idx, 'down')}
                          disabled={idx === warehouses.length - 1}
                        >
                          <Ionicons
                            name="chevron-down"
                            size={18}
                            color={idx === warehouses.length - 1 ? colors.border : colors.primary}
                          />
                        </TouchableOpacity>
                      </View>

                      {/* Linked Badge */}
                      {wh.is_linked && (
                        <View style={[styles.reorderLinkedBadge, { backgroundColor: colors.successSoft }]}>
                          <Text style={[styles.reorderLinkedText, { color: colors.success }]}>مربوطة</Text>
                        </View>
                      )}

                      {/* Warehouse Name on Right */}
                      <Text style={[styles.reorderWhName, { color: colors.text }]} numberOfLines={1}>
                        {wh.name}
                      </Text>

                      {/* Position Number */}
                      <View style={[styles.positionBadge, { backgroundColor: colors.card }]}>
                        <Text style={[styles.positionBadgeText, { color: colors.secondaryText }]}>
                          #{idx + 1}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                {/* Done Button */}
                <TouchableOpacity
                  style={[styles.doneBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setSortModalVisible(false)}
                >
                  <Text style={styles.doneBtnText}>حفظ الترتيب</Text>
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
  topBar: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: PADDING_HORIZONTAL,
    paddingTop: 8,
    paddingBottom: 4,
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
  controlsBar: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: PADDING_HORIZONTAL,
    paddingTop: 16,
    paddingBottom: 10,
  },
  sectionHeaderCol: {
    alignItems: 'flex-end',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  reorderBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
  },
  reorderBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: PADDING_HORIZONTAL,
    paddingTop: 6,
    paddingBottom: 28,
  },
  columnWrapper: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: CARD_GAP,
  },
  controlsActionsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  controlIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Luxury Card (Full-width)
  luxuryCard: {
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  luxuryCardAccentBar: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 4,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  luxuryCardContent: {
    padding: 14,
    paddingRight: 16,
  },
  luxuryHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  luxuryIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  luxuryTitleCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  luxuryWarehouseName: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  luxuryMetaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  brandTagPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  brandTagPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  liveStatusRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00d780',
  },
  liveGreenText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  inactiveMetaText: {
    fontSize: 11,
  },
  luxuryActionCol: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  linkedActionPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 100,
  },
  linkedActionPillText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '800',
  },
  connectActionPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 100,
  },
  connectActionPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  luxuryCardFooter: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  footerFeaturesList: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  featureItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
  },
  featureItemText: {
    fontSize: 11,
    fontWeight: '600',
  },
  featureDot: {
    fontSize: 10,
    color: '#94A3B8',
  },
  portalEnterHintRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  portalEnterHintText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Modern Grid Card
  modernGridCard: {
    width: CARD_WIDTH,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    marginBottom: CARD_GAP,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    justifyContent: 'space-between',
    minHeight: 140,
  },
  gridCardTopRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLinkedBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 100,
  },
  gridLinkedBadgeText: {
    color: '#059669',
    fontSize: 10,
    fontWeight: '800',
  },
  gridUnlinkedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
  },
  gridUnlinkedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  gridWarehouseName: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'right',
    marginVertical: 8,
    lineHeight: 18,
  },
  gridCardFooter: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  gridBrandTag: {
    fontSize: 10,
    fontWeight: '600',
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
  modalOverlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sortSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 38 : 24,
    maxHeight: '80%',
  },
  sheetHandleContainer: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  sheetHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },
  sortHeader: {
    alignItems: 'flex-end',
    marginVertical: 8,
    gap: 2,
  },
  sortTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  sortSubtitle: {
    fontSize: 12,
  },
  presetsRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    marginVertical: 12,
  },
  presetBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  reorderListLabel: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 8,
  },
  reorderScroll: {
    maxHeight: 250,
  },
  reorderItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  reorderWhName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  reorderLinkedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  reorderLinkedText: {
    fontSize: 10,
    fontWeight: '700',
  },
  positionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  positionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  arrowsCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  arrowBtn: {
    padding: 6,
  },
  disabledArrow: {
    opacity: 0.3,
  },
  doneBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
