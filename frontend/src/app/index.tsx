import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useColorScheme,
  View,
} from 'react-native';
import { Ionicons, FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useAuth } from '@/context/AuthContext';
import {
  fetchWarehouses,
  getPharmacySession,
  VerifyPharmacyResult,
  Warehouse,
} from '@/services/warehouse';
import PharmacyVerifyModal from '@/components/PharmacyVerifyModal';
import WarehousePortalScreen from '@/screens/WarehousePortalScreen';

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
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { user, logout } = useAuth();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loadingWarehouses, setLoadingWarehouses] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Profile Modal State
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  // Sorting / Reordering Modal State
  const [sortModalVisible, setSortModalVisible] = useState(false);

  // Verification Modal State
  const [verifyModalVisible, setVerifyModalVisible] = useState(false);
  const [selectedWarehouseForModal, setSelectedWarehouseForModal] = useState<Warehouse | null>(null);

  // Active Portal State (opened when pharmacy is verified)
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

  /**
   * Save custom order to SecureStore
   */
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

      // Apply saved custom order
      const orderedList = await applyCustomOrder(updatedList);
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
    const session = await getPharmacySession(wh.id);

    if (session && session.token) {
      // Already verified -> Open portal directly
      setActivePortal({
        warehouse: wh,
        token: session.token,
        pharmacyCode: session.pharmacy_code,
        pharmacyName: session.pharmacy_name,
      });
    } else {
      // First time -> Open bottom sheet modal
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

  // Reorder handlers
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

  const sortPreset = (type: 'linkedFirst' | 'alphabetical' | 'default') => {
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

  // Visual branding for each warehouse card
  const getWarehouseVisual = (wh: Warehouse) => {
    const name = (wh.name || '').toLowerCase();
    if (name.includes('sheikh') || name.includes('الشيخ')) {
      return {
        headerColor: '#1E3A8A',
        iconName: 'hospital-building' as const,
        brandLetter: 'S',
        brandTag: 'SHEIKH PHARMA',
        accentColor: '#3B82F6',
      };
    }
    if (name.includes('tabarak') || name.includes('تبارك')) {
      return {
        headerColor: '#064E3B',
        iconName: 'pill' as const,
        brandLetter: 'T',
        brandTag: 'TABARAK PHARMA',
        accentColor: '#10B981',
      };
    }
    if (name.includes('عميرة') || name.includes('abo3mara')) {
      return {
        headerColor: '#4C1D95',
        iconName: 'flask-round-bottom' as const,
        brandLetter: 'A',
        brandTag: 'ABO AMIRA',
        accentColor: '#8B5CF6',
      };
    }
    if (name.includes('x') || name.includes('إكس')) {
      return {
        headerColor: '#0F172A',
        iconName: 'shield-plus' as const,
        brandLetter: 'X',
        brandTag: 'X-PHARMA LOGISTICS',
        accentColor: '#0EA5E9',
      };
    }
    return {
      headerColor: '#1E293B',
      iconName: 'cube-outline' as const,
      brandLetter: wh.name ? wh.name.charAt(0) : 'W',
      brandTag: 'PHARMA DEPOT',
      accentColor: '#2563EB',
    };
  };

  // If a warehouse portal is open, render WarehousePortalScreen
  if (activePortal) {
    return (
      <WarehousePortalScreen
        warehouse={activePortal.warehouse}
        token={activePortal.token}
        pharmacyCode={activePortal.pharmacyCode}
        pharmacyName={activePortal.pharmacyName}
        onBack={() => setActivePortal(null)}
      />
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Top Header: Avatar on left, Brand on right */}
      <View style={[styles.topBar, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        {/* Right side: Brand */}
        <View style={styles.brandRow}>
          <Text style={[styles.brandText, { color: colors.text }]}>XPharma</Text>
          <View style={styles.brandDot} />
        </View>

        {/* Left side: Pharmacist Avatar (Opens Profile Modal) */}
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
                {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
          )}
          <View style={styles.onlineStatusDot} />
        </TouchableOpacity>
      </View>

      {/* Sub-header Bar with Warehouse Count & Reorder Button */}
      <View style={styles.controlsBar}>
        {/* Reorder Button */}
        <TouchableOpacity
          style={[styles.reorderBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={() => setSortModalVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="swap-vertical" size={16} color={colors.primary} />
          <Text style={[styles.reorderBtnText, { color: colors.primary }]}>ترتيب المستودعات</Text>
        </TouchableOpacity>

        {/* Section Title */}
        <View style={styles.sectionHeaderCol}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>مستودعات الأدوية</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.secondaryText }]}>
            {warehouses.length} مستودع نشط
          </Text>
        </View>
      </View>

      {/* Warehouses 2-Column Grid */}
      <FlatList
        data={warehouses}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        renderItem={({ item }) => {
          const visual = getWarehouseVisual(item);
          return (
            <TouchableOpacity
              style={[
                styles.gridCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              onPress={() => handleWarehousePress(item)}
              activeOpacity={0.88}
            >
              {/* Image / Banner Container at Top */}
              <View style={[styles.imageBanner, { backgroundColor: visual.headerColor }]}>
                {/* Logo & Emblem */}
                <View style={[styles.crestCircle, { borderColor: visual.accentColor }]}>
                  <MaterialCommunityIcons name={visual.iconName} size={32} color="#FFFFFF" />
                </View>
                <Text style={styles.brandBadgeText}>{visual.brandTag}</Text>

                {/* Status Badge in Top Corner */}
                {item.is_linked ? (
                  <View style={styles.cardStatusLinked}>
                    <Ionicons name="checkmark-circle" size={13} color="#10B981" />
                    <Text style={styles.cardStatusLinkedText}>مربوط</Text>
                  </View>
                ) : (
                  <View style={styles.cardStatusUnlinked}>
                    <Ionicons name="lock-open-outline" size={11} color="#FFFFFF" />
                    <Text style={styles.cardStatusUnlinkedText}>ربط</Text>
                  </View>
                )}
              </View>

              {/* Warehouse Details Underneath Image */}
              <View style={styles.cardBody}>
                <Text style={[styles.warehouseName, { color: colors.text }]} numberOfLines={2}>
                  {item.name}
                </Text>

                {item.is_linked ? (
                  <View style={[styles.codePill, { backgroundColor: colors.successSoft }]}>
                    <Text style={[styles.codePillText, { color: colors.success }]}>
                      كود: {item.linked_pharmacy_code}
                    </Text>
                  </View>
                ) : (
                  <View style={[styles.codePill, { backgroundColor: colors.primarySoft }]}>
                    <Text style={[styles.codePillText, { color: colors.primary }]}>
                      اضغط للربط
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          loadingWarehouses ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.secondaryText }]}>
                جارٍ تحميل مستودعات الأدوية...
              </Text>
            </View>
          ) : (
            <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="cube-outline" size={42} color={colors.secondaryText} />
              <Text style={[styles.emptyText, { color: colors.text }]}>لا توجد مستودعات متاحة</Text>
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
                {/* Close Button */}
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
                        {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
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

                {/* Info */}
                <Text style={[styles.profileName, { color: colors.text }]}>
                  {user?.name || 'مستخدم XPharma'}
                </Text>
                <Text style={[styles.profileEmail, { color: colors.secondaryText }]}>
                  {user?.email || 'حساب موثق'}
                </Text>

                <View style={[styles.profileRoleBadge, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.profileRoleText, { color: colors.primary }]}>
                    صيدلية معتمدة بالمنظومة
                  </Text>
                </View>

                <View style={[styles.profileDivider, { backgroundColor: colors.border }]} />

                {/* Security Tag */}
                <View style={styles.profileSecurityRow}>
                  <Ionicons name="shield-checkmark" size={16} color={colors.success} />
                  <Text style={[styles.profileSecurityText, { color: colors.secondaryText }]}>
                    جلسة اتصال مشفرة 256-bit
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
                    تسجيل الخروج من الحساب
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
                  <View style={[styles.sheetHandle, { backgroundColor: isDark ? '#334155' : '#CBD5E1' }]} />
                </View>

                <View style={styles.sortHeader}>
                  <Text style={[styles.sortTitle, { color: colors.text }]}>ترتيب وتقسيم المستودعات</Text>
                  <Text style={[styles.sortSubtitle, { color: colors.secondaryText }]}>
                    رتب المستودعات حسب رغبتك وسيتم حفظ الترتيب تلقائياً
                  </Text>
                </View>

                {/* Quick Presets */}
                <View style={styles.presetsRow}>
                  <TouchableOpacity
                    style={[styles.presetBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                    onPress={() => sortPreset('linkedFirst')}
                  >
                    <Ionicons name="checkmark-done" size={15} color={colors.success} />
                    <Text style={[styles.presetBtnText, { color: colors.text }]}>المربوطة أولاً</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.presetBtn, { borderColor: colors.border, backgroundColor: colors.bg }]}
                    onPress={() => sortPreset('alphabetical')}
                  >
                    <Ionicons name="text" size={15} color={colors.primary} />
                    <Text style={[styles.presetBtnText, { color: colors.text }]}>أبجدياً</Text>
                  </TouchableOpacity>
                </View>

                {/* Interactive Manual Reorder List */}
                <Text style={[styles.reorderListLabel, { color: colors.secondaryText }]}>
                  الترتيب اليدوي (استخدم الأسهم للتحريك):
                </Text>

                <ScrollView style={styles.reorderScroll} showsVerticalScrollIndicator={false}>
                  {warehouses.map((wh, idx) => (
                    <View
                      key={wh.id}
                      style={[styles.reorderItem, { backgroundColor: colors.bg, borderColor: colors.border }]}
                    >
                      {/* Arrows */}
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

                      {/* Status */}
                      {wh.is_linked && (
                        <View style={[styles.reorderLinkedBadge, { backgroundColor: colors.successSoft }]}>
                          <Text style={[styles.reorderLinkedText, { color: colors.success }]}>مربوط</Text>
                        </View>
                      )}

                      {/* Warehouse Name */}
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
                  <Text style={styles.doneBtnText}>حفظ وإغلاق</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: PADDING_HORIZONTAL,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  brandText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  brandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2563EB',
  },
  avatarButton: {
    position: 'relative',
  },
  avatarImg: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#2563EB',
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
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  controlsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: PADDING_HORIZONTAL,
    paddingTop: 14,
    paddingBottom: 8,
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
    marginTop: 1,
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
    justifyContent: 'space-between',
    marginBottom: CARD_GAP,
  },
  gridCard: {
    width: CARD_WIDTH,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  imageBanner: {
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  crestCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  brandBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    opacity: 0.9,
  },
  cardStatusLinked: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 100,
  },
  cardStatusLinkedText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '800',
  },
  cardStatusUnlinked: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 100,
  },
  cardStatusUnlinkedText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  cardBody: {
    padding: 12,
    alignItems: 'center',
    gap: 8,
  },
  warehouseName: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    minHeight: 36,
  },
  codePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  codePillText: {
    fontSize: 11,
    fontWeight: '700',
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
    right: 14,
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
