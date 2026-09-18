import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/context/AuthContext';
import {
  fetchWarehouses,
  getPharmacySession,
  savePharmacySession,
  VerifyPharmacyResult,
  Warehouse,
} from '@/services/warehouse';
import {
  getSubscriptionStatus,
  registerGlobalPharmacy,
  SubscriptionStatus,
} from '@/services/subscription';

// Modular Components
import { WarehouseCard } from '@/features/warehouses/components/WarehouseCard';
import { RequestWarehouseModal } from '@/features/warehouses/components/RequestWarehouseModal';
import { SettingsModal } from '@/features/settings/components/SettingsModal';
import PharmacyVerifyModal from '@/components/PharmacyVerifyModal';
import SubscriptionModal from '@/components/SubscriptionModal';
import WarehousePortalScreen from '@/screens/WarehousePortalScreen';
import XLogo, { XLogoHandle } from '@/components/XLogo';
import PromoBannerCarousel from '@/components/PromoBannerCarousel';
import { fetchBanners, Banner } from '@/services/banner';

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
  const { user, logout } = useAuth();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Banners & Category Tabs State
  const [banners, setBanners] = useState<Banner[]>([]);
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'pharma' | 'accessories'>('pharma');

  // Search State
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput>(null);

  // Warehouse Request Modal State
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [requestedWhName, setRequestedWhName] = useState('');
  const [requestedWhPhone, setRequestedWhPhone] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);

  // Profile / Settings Modal State
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  // Subscription & Trial Modal State
  const [subscriptionModalVisible, setSubscriptionModalVisible] = useState(false);
  const [subscriptionReason, setSubscriptionReason] = useState<string | undefined>();
  const [subscriptionRequiredPlan, setSubscriptionRequiredPlan] = useState<number>(2);
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [subscriptionStatusInfo, setSubscriptionStatusInfo] = useState<SubscriptionStatus | null>(null);

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

  const colors = {
    bg: '#F9F7FD',
    card: '#FFFFFF',
    text: '#1A0A33',
    secondaryText: '#6B5E82',
    border: '#E9E3F3',
    primary: '#3f0082',
    primarySoft: '#3f008215',
  };

  const navigateWebsite = () => {
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
    Linking.openURL('https://xpharma.cloud/').catch((err) => {
      console.warn('Could not open URL:', err);
    });
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 1500);
  };

  const handleLogoPress = () => {
    if (isNavigatingRef.current) return;
    isNavigatingRef.current = true;
    animationStartTimeRef.current = Date.now();
    headerLogoRef.current?.play();

    if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current);
    navigationTimeoutRef.current = setTimeout(() => {
      navigateWebsite();
    }, 1450);
  };

  const handleAnimationFinish = () => {
    const elapsed = Date.now() - animationStartTimeRef.current;
    if (isNavigatingRef.current && elapsed >= 1100) {
      navigateWebsite();
    }
  };

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
      setWarehouses(sortWarehouses(uniqueList));
    } catch (e) {
      console.error('Failed to load warehouses:', e);
    } finally {
      setLoadingWarehouses(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadWarehouses();
    fetchBanners().then(setBanners);
    const checkTrial = async () => {
      const status = await getSubscriptionStatus(user?.email);
      setSubscriptionStatusInfo(status);
      if (status.isTrialExpired) {
        setIsTrialExpired(true);
        setSubscriptionReason('انتهت الفترة التجريبية (7 أيام). يرجى الاشتراك للاستمرار في فتح المخازن.');
        setSubscriptionRequiredPlan(Math.max(1, status.linkedPharmaciesCount));
      }
    };
    checkTrial();
  }, [user?.id, user?.email]);

  const onRefresh = () => {
    setRefreshing(true);
    loadWarehouses();
    fetchBanners().then(setBanners);
    getSubscriptionStatus(user?.email).then(setSubscriptionStatusInfo);
  };

  const handleWarehousePress = async (wh: Warehouse) => {
    const subStatus = await getSubscriptionStatus(user?.email);
    setSubscriptionStatusInfo(subStatus);
    if (subStatus.isTrialExpired) {
      setSubscriptionReason('انتهت الفترة التجريبية (7 أيام). يرجى الاشتراك للاستمرار في فتح المخازن.');
      setSubscriptionRequiredPlan(Math.max(1, subStatus.linkedPharmaciesCount));
      setIsTrialExpired(true);
      setSubscriptionModalVisible(true);
      return;
    }

    let session = await getPharmacySession(wh.id);

    if ((session && session.token) || (wh.is_linked && (wh.pharmacy_token || session?.token))) {
      const activeToken = session?.token || wh.pharmacy_token || '';
      const activeCode = session?.pharmacy_code || wh.linked_pharmacy_code || '';
      const activeName = session?.pharmacy_name || wh.linked_pharmacy_name || '';

      if (activeCode && activeName) {
        await registerGlobalPharmacy(activeCode, activeName);
      }

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

    await registerGlobalPharmacy(result.pharmacy_code || '', result.pharmacy_name || '');
    const updatedStatus = await getSubscriptionStatus(user?.email);
    setSubscriptionStatusInfo(updatedStatus);

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

  const pharmaCount = useMemo(() => {
    return warehouses.filter(
      (w) => !w.category?.includes('إكسسوار') && !w.category?.includes('مستلزمات')
    ).length;
  }, [warehouses]);

  const accessoriesCount = useMemo(() => {
    return warehouses.filter(
      (w) => w.category?.includes('إكسسوار') || w.category?.includes('مستلزمات')
    ).length;
  }, [warehouses]);

  const filteredWarehouses = useMemo(() => {
    const categoryFiltered = warehouses.filter((w) => {
      const isAcc = w.category?.includes('إكسسوار') || w.category?.includes('مستلزمات');
      return selectedCategoryTab === 'accessories' ? isAcc : !isAcc;
    });

    if (!searchQuery.trim()) return categoryFiltered;
    const q = searchQuery.trim().toLowerCase();
    return categoryFiltered.filter((w) => {
      const nameMatch = (w.name || '').toLowerCase().includes(q);
      const catMatch = (w.category || '').toLowerCase().includes(q);
      const slugMatch = (w.slug || '').toLowerCase().includes(q);
      return nameMatch || catMatch || slugMatch;
    });
  }, [warehouses, selectedCategoryTab, searchQuery]);

  const openRequestModal = (name?: string) => {
    setRequestedWhName(name !== undefined ? name : searchQuery.trim());
    setRequestedWhPhone('');
    setRequestSuccess(false);
    setRequestModalVisible(true);
  };

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

  useEffect(() => {
    const onBackPress = () => {
      if (activePortal) return false;
      if (subscriptionModalVisible && !isTrialExpired) {
        setSubscriptionModalVisible(false);
        return true;
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
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [
    activePortal,
    subscriptionModalVisible,
    isTrialExpired,
    requestModalVisible,
    isSearchActive,
    verifyModalVisible,
    profileModalVisible,
  ]);

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

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} translucent={false} />

      {/* Warehouses List */}
      <FlatList
        key={isTablet ? 'tablet-grid' : 'phone-list'}
        data={filteredWarehouses}
        keyExtractor={(item) => item.id}
        numColumns={isTablet ? 2 : 1}
        columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: topInset + 60 + 20 },
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
        ListHeaderComponent={
          <View style={styles.listHeaderContainer}>
            {/* Promo Banners Carousel */}
            {!isSearchActive && (
              <PromoBannerCarousel
                banners={banners}
                onWarehousePress={(slugOrId) => {
                  const target = warehouses.find(
                    (w) => w.slug === slugOrId || w.id === slugOrId
                  );
                  if (target) handleWarehousePress(target);
                }}
              />
            )}

            {/* Google Play Style Category Tabs */}
            <View style={styles.tabsContainer}>
              <TouchableOpacity
                style={[
                  styles.categoryTab,
                  selectedCategoryTab === 'pharma' && styles.categoryTabActive,
                ]}
                onPress={() => setSelectedCategoryTab('pharma')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="medkit"
                  size={15}
                  color={selectedCategoryTab === 'pharma' ? '#FFFFFF' : colors.primary}
                  style={{ marginLeft: 6 }}
                />
                <Text
                  style={[
                    styles.categoryTabText,
                    selectedCategoryTab === 'pharma' && styles.categoryTabTextActive,
                  ]}
                >
                  مخازن الأدوية
                </Text>
                <View
                  style={[
                    styles.tabCountBadge,
                    selectedCategoryTab === 'pharma'
                      ? styles.tabCountBadgeActive
                      : styles.tabCountBadgeInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabCountText,
                      selectedCategoryTab === 'pharma' && styles.tabCountTextActive,
                    ]}
                  >
                    {pharmaCount}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.categoryTab,
                  selectedCategoryTab === 'accessories' && styles.categoryTabActive,
                ]}
                onPress={() => setSelectedCategoryTab('accessories')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="sparkles"
                  size={15}
                  color={selectedCategoryTab === 'accessories' ? '#FFFFFF' : colors.primary}
                  style={{ marginLeft: 6 }}
                />
                <Text
                  style={[
                    styles.categoryTabText,
                    selectedCategoryTab === 'accessories' && styles.categoryTabTextActive,
                  ]}
                >
                  إكسسوارات ومستحضرات
                </Text>
                <View
                  style={[
                    styles.tabCountBadge,
                    selectedCategoryTab === 'accessories'
                      ? styles.tabCountBadgeActive
                      : styles.tabCountBadgeInactive,
                  ]}
                >
                  <Text
                    style={[
                      styles.tabCountText,
                      selectedCategoryTab === 'accessories' && styles.tabCountTextActive,
                    ]}
                  >
                    {accessoriesCount}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <WarehouseCard
            item={item}
            onPress={handleWarehousePress}
            width={isTablet ? TABLET_CARD_WIDTH : undefined}
            marginBottom={isTablet ? CARD_GAP : 12}
          />
        )}
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

      {/* Fixed Top Header */}
      <View style={[styles.fixedHeaderArea, { paddingTop: topInset, backgroundColor: colors.bg }]}>
        {isSearchActive ? (
          <View style={styles.searchBarActiveContainer}>
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

            <View style={styles.searchInputActiveWrapper}>
              <Ionicons name="search" size={18} color={colors.secondaryText} style={styles.searchInnerIcon} />
              <TextInput
                ref={searchInputRef}
                style={styles.searchActiveTextInput}
                placeholder="ابحث باسم المخزن أو الصيدلية..."
                placeholderTextColor={colors.secondaryText}
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
                onSubmitEditing={() => {
                  if (searchQuery.trim().length > 0 && filteredWarehouses.length === 0) {
                    openRequestModal(searchQuery.trim());
                  }
                }}
                autoFocus
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                  <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <View style={styles.headerTopRow}>
            {/* Left side: Avatar & Search Button */}
            <View style={styles.headerLeftRow}>
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
            </View>

            {/* Right side: Brand Logo & Word */}
            <TouchableOpacity
              style={styles.brandRow}
              onPress={handleLogoPress}
              activeOpacity={0.7}
            >
              <Text style={[styles.brandText, { color: '#3f0082' }]}>فارما</Text>
              <XLogo
                ref={headerLogoRef}
                size={48}
                scale={1.8}
                speed={1.0}
                autoPlay={false}
                loop={false}
                onAnimationFinish={handleAnimationFinish}
              />
            </TouchableOpacity>
          </View>
        )}

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

      {/* Modular Modals */}
      <PharmacyVerifyModal
        visible={verifyModalVisible}
        warehouse={selectedWarehouseForModal}
        onClose={() => {
          setVerifyModalVisible(false);
          setSelectedWarehouseForModal(null);
        }}
        onSuccess={handleVerificationSuccess}
      />

      <SettingsModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        user={user}
        subscriptionStatusInfo={subscriptionStatusInfo}
        onOpenSubscriptionModal={() => setSubscriptionModalVisible(true)}
        onLogout={logout}
      />

      <RequestWarehouseModal
        visible={requestModalVisible}
        onClose={() => setRequestModalVisible(false)}
        warehouseName={requestedWhName}
        setWarehouseName={setRequestedWhName}
        warehousePhone={requestedWhPhone}
        setWarehousePhone={setRequestedWhPhone}
        submitting={submittingRequest}
        success={requestSuccess}
        onSubmit={handleSubmitWarehouseRequest}
        onSuccessDone={() => {
          setRequestModalVisible(false);
          setIsSearchActive(false);
          setSearchQuery('');
        }}
      />

      <SubscriptionModal
        visible={subscriptionModalVisible}
        onClose={() => setSubscriptionModalVisible(false)}
        reason={subscriptionReason}
        suggestedPlan={subscriptionRequiredPlan}
        isTrialExpired={isTrialExpired}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  columnWrapper: {
    gap: CARD_GAP,
  },
  fixedHeaderArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    height: 60,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: -4,
  },
  brandText: {
    fontSize: 22.5,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginRight: -4,
    transform: [{ translateY: 6.5 }],
  },
  headerLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerSearchBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarButton: {
    position: 'relative',
  },
  avatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  onlineStatusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00d780',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  featherEdge: {
    height: 38,
    width: '100%',
  },
  searchBarActiveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 60,
    gap: 10,
  },
  searchCloseBtn: {
    padding: 6,
  },
  searchInputActiveWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(63, 0, 130, 0.06)',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
  },
  searchInnerIcon: {
    marginRight: 6,
  },
  searchActiveTextInput: {
    flex: 1,
    fontSize: 14,
    color: '#1A0A33',
    textAlign: 'right',
  },
  clearSearchBtn: {
    padding: 4,
  },
  loadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptySearchBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 20,
    gap: 10,
  },
  emptyIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
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
    lineHeight: 19,
    paddingHorizontal: 12,
  },
  requestWhCtaBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 14,
    marginTop: 6,
  },
  requestWhCtaBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  listHeaderContainer: {
    paddingBottom: 14,
  },
  tabsContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
    marginBottom: 4,
  },
  categoryTab: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E9E3F3',
    shadowColor: '#3F0082',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 1.5,
    gap: 6,
  },
  categoryTabActive: {
    backgroundColor: '#3F0082',
    borderColor: '#3F0082',
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  categoryTabText: {
    fontSize: isTablet ? 14 : 12.5,
    fontWeight: '800',
    color: '#3F0082',
  },
  categoryTabTextActive: {
    color: '#FFFFFF',
  },
  tabCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  tabCountBadgeInactive: {
    backgroundColor: 'rgba(63, 0, 130, 0.08)',
  },
  tabCountText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#3F0082',
  },
  tabCountTextActive: {
    color: '#FFFFFF',
  },
});
