import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
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

  // Search State
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);

  // Warehouse Request Modal State (when searched warehouse doesn't exist)
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [requestedWhName, setRequestedWhName] = useState('');
  const [requestedWhPhone, setRequestedWhPhone] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);

  // Profile Bottom Sheet Modal State
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

  // Filtered warehouses based on active search
  const filteredWarehouses = useMemo(() => {
    if (!searchQuery.trim()) return warehouses;
    const q = searchQuery.trim().toLowerCase();
    return warehouses.filter((w) => {
      const nameMatch = (w.name || '').toLowerCase().includes(q);
      const catMatch = (w.category || '').toLowerCase().includes(q);
      const slugMatch = (w.slug || '').toLowerCase().includes(q);
      return nameMatch || catMatch || slugMatch;
    });
  }, [warehouses, searchQuery]);

  // Open the request warehouse bottom sheet modal
  const openRequestModal = (name?: string) => {
    setRequestedWhName(name !== undefined ? name : searchQuery.trim());
    setRequestedWhPhone('');
    setRequestSuccess(false);
    setRequestModalVisible(true);
  };

  // When submitting search query and no matching warehouse is found
  const handleSearchSubmit = () => {
    if (searchQuery.trim().length > 0 && filteredWarehouses.length === 0) {
      openRequestModal(searchQuery.trim());
    }
  };

  // Submit warehouse onboarding request to support backend
  const handleSubmitWarehouseRequest = async () => {
    if (!requestedWhName.trim()) {
      Alert.alert('تنبيه', 'يرجى كتابة اسم المخزن');
      return;
    }
    if (!requestedWhPhone.trim()) {
      Alert.alert('تنبيه', 'يرجى كتابة رقم تليفون أو واتساب المخزن للتواصل معه');
      return;
    }

    try {
      setSubmittingRequest(true);
      const res = await fetch('https://api.xpharma.cloud/v1/warehouses/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouse_name: requestedWhName.trim(),
          warehouse_phone: requestedWhPhone.trim(),
          user_id: user?.id || '',
          user_email: user?.email || '',
          user_name: user?.name || '',
          notes: 'طلب إضافة مخزن من تطبيق الهاتف',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setRequestSuccess(true);
      } else {
        Alert.alert('خطأ', data.error || 'فشل إرسال الطلب، يرجى المحاولة لاحقاً');
      }
    } catch (err) {
      Alert.alert('خطأ', 'تعذر الاتصال بالسيرفر، يرجى التحقق من اتصال الإنترنت');
    } finally {
      setSubmittingRequest(false);
    }
  };

  // Handle Android hardware/gesture back button:
  useEffect(() => {
    const onBackPress = () => {
      if (activePortal) {
        // Handled by WarehousePortalScreen
        return false;
      }
      if (requestModalVisible) {
        setRequestModalVisible(false);
        return true;
      }
      if (isSearchActive) {
        setIsSearchActive(false);
        setSearchQuery('');
        return true;
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
  }, [activePortal, requestModalVisible, isSearchActive, verifyModalVisible, profileModalVisible]);

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
        data={filteredWarehouses}
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
          ) : searchQuery.trim().length > 0 ? (
            <View style={[styles.emptySearchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.emptyIconCircle, { backgroundColor: 'rgba(63, 0, 130, 0.08)' }]}>
                <Ionicons name="search-outline" size={32} color={colors.primary} />
              </View>
              <Text style={[styles.emptySearchTitle, { color: colors.text }]}>
                المخزن "{searchQuery.trim()}" غير متاح حالياً
              </Text>
              <Text style={[styles.emptySearchDesc, { color: colors.secondaryText }]}>
                حابب نوفرلك المخزن ده؟ اطلب إضافته وهيتواصل فريق دعم التطبيق مع إدارته للاشتراك والربط.
              </Text>
              <TouchableOpacity
                style={[styles.requestWhCtaBtn, { backgroundColor: colors.primary }]}
                onPress={() => openRequestModal(searchQuery.trim())}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle-outline" size={19} color="#FFFFFF" />
                <Text style={styles.requestWhCtaBtnText}>اطلب إضافة المخزن الآن</Text>
              </TouchableOpacity>
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
        {isSearchActive ? (
          <View style={styles.searchBarActiveContainer}>
            {/* Close / Back button */}
            <TouchableOpacity
              style={styles.searchCloseBtn}
              onPress={() => {
                setIsSearchActive(false);
                setSearchQuery('');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-forward" size={22} color={colors.text} />
            </TouchableOpacity>

            {/* Search Input Box */}
            <View style={[styles.searchInputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.secondaryText} style={styles.searchIconInside} />
              <TextInput
                ref={searchInputRef}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="ابحث عن اسم المخزن..."
                placeholderTextColor={colors.secondaryText}
                style={[styles.searchInput, { color: colors.text }]}
                returnKeyType="search"
                onSubmitEditing={handleSearchSubmit}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  style={styles.searchClearBtn}
                >
                  <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
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

            {/* Left side: Search Icon Button & Avatar */}
            <View style={styles.headerLeftRow}>
              {/* Search Icon Button (Before Avatar) */}
              <TouchableOpacity
                style={[styles.headerSearchBtn, { backgroundColor: 'rgba(63, 0, 130, 0.08)' }]}
                onPress={() => {
                  setIsSearchActive(true);
                  setTimeout(() => searchInputRef.current?.focus(), 150);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="search" size={20} color={colors.primary} />
              </TouchableOpacity>

              {/* Avatar opens Profile Bottom Sheet */}
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
          </View>
        )}

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

      {/* Profile Bottom Sheet Modal (From bottom, "صيدلية معتمدة" removed) */}
      <Modal
        visible={profileModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setProfileModalVisible(false)}>
          <View style={styles.modalOverlayBottom}>
            <TouchableWithoutFeedback>
              <View style={[styles.bottomSheetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {/* Drag Handle Indicator */}
                <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

                {/* Close Button */}
                <TouchableOpacity
                  style={[styles.closeIconBtnSheet, { borderColor: colors.border }]}
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

                {/* Note: "صيدلية معتمدة" badge was removed per user request */}

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

      {/* Request Warehouse Bottom Sheet Modal */}
      <Modal
        visible={requestModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRequestModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardAvoid}
        >
          <TouchableWithoutFeedback onPress={() => setRequestModalVisible(false)}>
            <View style={styles.modalOverlayBottom}>
              <TouchableWithoutFeedback>
                <View style={[styles.bottomSheetCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  {/* Drag Handle Indicator */}
                  <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />

                  {/* Header */}
                  <View style={styles.sheetHeaderRow}>
                    <TouchableOpacity
                      style={[styles.closeIconBtnHeader, { borderColor: colors.border }]}
                      onPress={() => setRequestModalVisible(false)}
                    >
                      <Ionicons name="close" size={20} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.sheetHeaderTitle, { color: colors.text }]}>طلب إضافة مخزن</Text>
                    <View style={{ width: 32 }} />
                  </View>

                  {requestSuccess ? (
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
                        onPress={() => {
                          setRequestModalVisible(false);
                          setIsSearchActive(false);
                          setSearchQuery('');
                        }}
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

                      {/* Input 1: Warehouse Name (Pre-filled from search query) */}
                      <View style={styles.formGroup}>
                        <Text style={[styles.inputLabel, { color: colors.text }]}>اسم المخزن</Text>
                        <View style={[styles.modalInputWrapper, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                          <Ionicons name="business-outline" size={19} color={colors.secondaryText} style={styles.modalInputIcon} />
                          <TextInput
                            value={requestedWhName}
                            onChangeText={setRequestedWhName}
                            placeholder="اكتب اسم المخزن..."
                            placeholderTextColor={colors.secondaryText}
                            style={[styles.modalTextInput, { color: colors.text }]}
                          />
                        </View>
                      </View>

                      {/* Input 2: Warehouse Phone */}
                      <View style={styles.formGroup}>
                        <Text style={[styles.inputLabel, { color: colors.text }]}>رقم تليفون / واتساب المخزن للتواصل</Text>
                        <View style={[styles.modalInputWrapper, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                          <Ionicons name="call-outline" size={19} color={colors.secondaryText} style={styles.modalInputIcon} />
                          <TextInput
                            value={requestedWhPhone}
                            onChangeText={setRequestedWhPhone}
                            placeholder="مثال: 01012345678"
                            placeholderTextColor={colors.secondaryText}
                            keyboardType="phone-pad"
                            style={[styles.modalTextInput, { color: colors.text }]}
                          />
                        </View>
                      </View>

                      {/* Submit Button */}
                      <TouchableOpacity
                        style={[
                          styles.requestSubmitBtn,
                          { backgroundColor: colors.primary },
                          submittingRequest && { opacity: 0.75 },
                        ]}
                        onPress={handleSubmitWarehouseRequest}
                        disabled={submittingRequest}
                        activeOpacity={0.85}
                      >
                        {submittingRequest ? (
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
  headerLeftRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  headerSearchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarActiveContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: PADDING_HORIZONTAL,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 10,
    width: '100%',
  },
  searchCloseBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchIconInside: {
    marginLeft: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    paddingVertical: 0,
  },
  searchClearBtn: {
    padding: 4,
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
    minHeight: 116,
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
    paddingVertical: 22,
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

  // Search Empty State
  emptySearchBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 26,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    marginTop: 16,
  },
  emptyIconCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptySearchTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptySearchDesc: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  requestWhCtaBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 14,
    marginTop: 8,
  },
  requestWhCtaBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  // Bottom Sheet Modals
  keyboardAvoid: {
    flex: 1,
  },
  modalOverlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  bottomSheetCard: {
    width: '100%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 38 : 26,
    paddingHorizontal: 22,
    alignItems: 'center',
    position: 'relative',
  },
  sheetHandle: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    marginBottom: 12,
  },
  sheetHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
  },
  sheetHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  closeIconBtnSheet: {
    position: 'absolute',
    top: 14,
    left: 18,
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeIconBtnHeader: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Profile Elements
  profileAvatarContainer: {
    position: 'relative',
    marginTop: 4,
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
  profileDivider: {
    height: 1,
    width: '100%',
    marginVertical: 12,
  },
  profileSecurityRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
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

  // Request Warehouse Form
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
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  modalInputWrapper: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    gap: 8,
  },
  modalInputIcon: {
    marginLeft: 2,
  },
  modalTextInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    paddingVertical: 0,
  },
  requestSubmitBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 48,
    borderRadius: 14,
    marginTop: 8,
  },
  requestSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  requestSuccessBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    gap: 10,
    width: '100%',
  },
  successIconCircle: {
    marginBottom: 6,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 13.5,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 21,
  },
  successDoneBtn: {
    width: '100%',
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  successDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
