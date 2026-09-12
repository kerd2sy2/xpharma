import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  PanResponder,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PharmacyVerifyModal from '@/components/PharmacyVerifyModal';
import XLogo from '@/components/XLogo';
import {
  fetchPharmacyBalance,
  fetchPharmacyPurchases,
  fetchPharmacyReceipts,
  fetchPharmacyReturns,
  fetchPharmacyStatement,
  getWarehousePharmacies,
  saveWarehousePharmacy,
  InvoiceItem,
  LinkedPharmacyAccount,
  PharmacyBalance,
  ReceiptItem,
  ReturnItem,
  StatementItem,
  VerifyPharmacyResult,
  Warehouse,
} from '@/services/warehouse';

interface WarehousePortalScreenProps {
  warehouse: Warehouse;
  token: string;
  pharmacyCode: string;
  pharmacyName: string;
  onBack: () => void;
}

type SectionKey = 'purchases' | 'returns' | 'receipts' | 'statement';

export default function WarehousePortalScreen({
  warehouse,
  token,
  pharmacyCode,
  pharmacyName,
  onBack,
}: WarehousePortalScreenProps) {
  const { width, height } = useWindowDimensions();
  const [selectedSection, setSelectedSection] = useState<SectionKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isSwitchingPharmacy, setIsSwitchingPharmacy] = useState(false);
  const [loaderAnimKey, setLoaderAnimKey] = useState(0);

  // Multi-pharmacy state
  const [activePharmacyIndex, setActivePharmacyIndex] = useState(0);
  const [currentToken, setCurrentToken] = useState(token);
  const [currentPharmacyCode, setCurrentPharmacyCode] = useState(pharmacyCode);
  const [currentPharmacyName, setCurrentPharmacyName] = useState(pharmacyName);
  const [pharmacies, setPharmacies] = useState<LinkedPharmacyAccount[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Animation values for the flying paper effect
  const pan = useRef(new Animated.ValueXY()).current;
  const pharmaciesRef = useRef(pharmacies);
  pharmaciesRef.current = pharmacies;
  const activeIndexRef = useRef(activePharmacyIndex);
  activeIndexRef.current = activePharmacyIndex;

  const [balance, setBalance] = useState<PharmacyBalance | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [statement, setStatement] = useState<StatementItem[]>([]);

  const colors = {
    bg: '#F9F7FD',
    card: '#FFFFFF',
    cardBack: '#F4EFFC',
    cardBack2: '#E7DCF8',
    text: '#1A0A33',
    secondaryText: '#7B6F93',
    border: '#EDE7F6',
    borderLayer2: '#CBB5EB',
    borderLayer3: '#B69CE3',
    primary: '#3f0082',
    primarySoft: '#3f008212',
    success: '#00B86B',
    successSoft: '#00B86B14',
    warning: '#D97706',
    warningSoft: '#D9770614',
    indigo: '#4F46E5',
    indigoSoft: '#4F46E514',
  };

  // Initialize and load saved pharmacies for this warehouse
  useEffect(() => {
    const initPharmacies = async () => {
      const list = await getWarehousePharmacies(warehouse.id);
      if (list.length === 0 && token) {
        const initialAccount: LinkedPharmacyAccount = {
          token,
          pharmacy_code: pharmacyCode,
          pharmacy_name: pharmacyName,
          tenant_id: warehouse.id,
        };
        const saved = await saveWarehousePharmacy(warehouse.id, initialAccount);
        const finalList = saved.length > 0 ? saved : [initialAccount];
        setPharmacies(finalList);
      } else {
        setPharmacies(list);
      }
    };
    initPharmacies();
  }, [warehouse.id, token]);

  const loadData = async (targetToken = currentToken, showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [bal, invs, rets, recs, stmts] = await Promise.all([
        fetchPharmacyBalance(targetToken),
        fetchPharmacyPurchases(targetToken),
        fetchPharmacyReturns(targetToken),
        fetchPharmacyReceipts(targetToken),
        fetchPharmacyStatement(targetToken),
      ]);

      // Filter out items with value 0
      const validInvoices = (invs || []).filter(
        (inv) => (inv.net_amount ?? inv.total_amount ?? 0) > 0
      );
      const validReturns = (rets || []).filter(
        (ret) => (ret.net_amount ?? ret.total_amount ?? 0) > 0
      );
      const validReceipts = (recs || []).filter(
        (rec) => (rec.amount ?? 0) > 0
      );
      const validStatement = (stmts || []).filter(
        (stm) => (stm.debit ?? 0) > 0 || (stm.credit ?? 0) > 0
      );

      setBalance(bal);
      setInvoices(validInvoices);
      setReturns(validReturns);
      setReceipts(validReceipts);
      setStatement(validStatement);
    } catch (e) {
      console.error('Error loading pharmacy data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(currentToken, true);
  }, [currentToken]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(currentToken, false);
  };

  // Fly card like paper, then show full-page logo overlay until the other pharmacy loads
  const flyToPharmacy = (direction: 'next' | 'prev') => {
    const count = pharmaciesRef.current.length;
    if (count <= 1) return;

    const targetX = direction === 'next' ? -500 : 500;
    Animated.timing(pan, {
      toValue: { x: targetX, y: 15 },
      duration: 160,
      useNativeDriver: true,
    }).start(async () => {
      pan.setValue({ x: 0, y: 0 });
      const nextIdx =
        direction === 'next'
          ? (activeIndexRef.current + 1) % count
          : (activeIndexRef.current - 1 + count) % count;

      const targetPh = pharmaciesRef.current[nextIdx];
      if (targetPh) {
        // Start loader from frame 0 and cover fullscreen
        setLoaderAnimKey((k) => k + 1);
        setIsSwitchingPharmacy(true);
        setActivePharmacyIndex(nextIdx);
        setCurrentToken(targetPh.token);
        setCurrentPharmacyCode(targetPh.pharmacy_code);
        setCurrentPharmacyName(targetPh.pharmacy_name);

        const startTime = Date.now();
        await loadData(targetPh.token, false);
        const elapsed = Date.now() - startTime;
        if (elapsed < 1200) {
          await new Promise((r) => setTimeout(r, 1200 - elapsed));
        }
        setIsSwitchingPharmacy(false);
      }
    });
  };

  // Pan Responder for "Flying Paper" horizontal swipe gesture
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return (
            pharmaciesRef.current.length > 1 &&
            Math.abs(gestureState.dx) > 15 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.5
          );
        },
        onPanResponderMove: (_, gestureState) => {
          pan.setValue({ x: gestureState.dx, y: gestureState.dy * 0.15 });
        },
        onPanResponderRelease: (_, gestureState) => {
          const threshold = 60;
          const velocityThreshold = 0.3;
          if (
            Math.abs(gestureState.dx) > threshold ||
            Math.abs(gestureState.vx) > velocityThreshold
          ) {
            const isSwipeLeft = gestureState.dx < 0;
            flyToPharmacy(isSwipeLeft ? 'next' : 'prev');
          } else {
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              friction: 5,
              tension: 40,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    []
  );

  // When a new pharmacy is verified and added
  const handleAddSuccess = async (result: VerifyPharmacyResult) => {
    if (!result.token) return;
    setShowAddModal(false);
    setLoaderAnimKey((k) => k + 1);
    setIsSwitchingPharmacy(true);

    const newAccount: LinkedPharmacyAccount = {
      token: result.token,
      pharmacy_code: result.pharmacy_code || '',
      pharmacy_name: result.pharmacy_name || 'الصيدلية',
      tenant_id: warehouse.id,
    };
    const updatedList = await saveWarehousePharmacy(warehouse.id, newAccount);
    setPharmacies(updatedList);
    setActivePharmacyIndex(0);
    setCurrentToken(newAccount.token);
    setCurrentPharmacyCode(newAccount.pharmacy_code);
    setCurrentPharmacyName(newAccount.pharmacy_name);

    const startTime = Date.now();
    await loadData(newAccount.token, false);
    const elapsed = Date.now() - startTime;
    if (elapsed < 1200) {
      await new Promise((resolve) => setTimeout(resolve, 1200 - elapsed));
    }
    setIsSwitchingPharmacy(false);
  };

  const formatCurrency = (amount?: number) => {
    const val = amount ?? 0;
    return `${val.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, 24);

  // Sections configuration
  const sections = [
    {
      key: 'purchases' as SectionKey,
      title: 'المشتريات',
      desc: 'سجل فواتير المشتريات المستلمة',
      amount: balance?.total_purchases,
      count: invoices.length,
      icon: 'cart-outline' as const,
      color: colors.primary,
      bgColor: colors.primarySoft,
    },
    {
      key: 'returns' as SectionKey,
      title: 'المرتجعات',
      desc: 'سجل فواتير المرتجع للمخزن',
      amount: balance?.total_returns,
      count: returns.length,
      icon: 'arrow-undo-outline' as const,
      color: colors.warning,
      bgColor: colors.warningSoft,
    },
    {
      key: 'receipts' as SectionKey,
      title: 'النقدية',
      desc: 'سجل المقبوضات والدفعات المالية',
      amount: balance?.total_paid,
      count: receipts.length,
      icon: 'cash-outline' as const,
      color: colors.success,
      bgColor: colors.successSoft,
    },
    {
      key: 'statement' as SectionKey,
      title: 'كشف حساب',
      desc: 'حركات الحساب التفصيلية والرصيد',
      count: statement.length,
      icon: 'receipt-outline' as const,
      color: colors.indigo,
      bgColor: colors.indigoSoft,
    },
  ];

  // ----------------------------------------------------
  // SUB-SCREEN: DEDICATED SECTION PAGE (صفحة منفصلة للقسم)
  // ----------------------------------------------------
  if (selectedSection) {
    const currentSection = sections.find((s) => s.key === selectedSection);

    return (
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset }]}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} translucent={false} />

        {/* Section Page Header */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={styles.backBtnClean}
            onPress={() => setSelectedSection(null)}
            activeOpacity={0.6}
          >
            <Ionicons name="arrow-forward" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topHeaderTitle, { color: colors.text }]}>
            {currentSection?.title}
          </Text>
          <View style={styles.topHeaderSpacer} />
        </View>

        {/* Section Quick Summary Bar */}
        <View style={[styles.sectionSummaryBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.summaryBarCol}>
            <Text style={[styles.summaryBarDesc, { color: colors.secondaryText }]}>
              {currentSection?.desc}
            </Text>
            {currentSection?.amount !== undefined && (
              <Text style={[styles.summaryBarAmount, { color: currentSection.color }]}>
                {formatCurrency(currentSection.amount)}
              </Text>
            )}
          </View>
          <View style={[styles.summaryCountBadge, { backgroundColor: currentSection?.bgColor }]}>
            <Text style={[styles.summaryCountText, { color: currentSection?.color }]}>
              {currentSection?.count} سجل
            </Text>
          </View>
        </View>

        {/* Section List Content */}
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.subPageScrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {/* PURCHASES LIST */}
          {selectedSection === 'purchases' && (
            invoices.length === 0 ? (
              <View style={[styles.simpleEmptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="cart-outline" size={38} color={colors.secondaryText} />
                <Text style={[styles.simpleEmptyText, { color: colors.secondaryText }]}>لا توجد فواتير مشتريات</Text>
              </View>
            ) : (
              invoices.map((inv, idx) => (
                <View
                  key={inv.id || idx}
                  style={[styles.simpleRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.rowCardRight}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>
                      فاتورة #{inv.invoice_number || inv.remote_id}
                    </Text>
                    <Text style={[styles.rowDate, { color: colors.secondaryText }]}>
                      {formatDate(inv.invoice_date)}
                    </Text>
                  </View>
                  <View style={styles.rowCardLeft}>
                    <Text style={[styles.rowAmount, { color: colors.primary }]}>
                      {formatCurrency(inv.net_amount || inv.total_amount)}
                    </Text>
                    {inv.status ? (
                      <Text style={[styles.rowStatusText, { color: colors.secondaryText }]}>
                        {inv.status}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))
            )
          )}

          {/* RETURNS LIST */}
          {selectedSection === 'returns' && (
            returns.length === 0 ? (
              <View style={[styles.simpleEmptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="arrow-undo-outline" size={38} color={colors.secondaryText} />
                <Text style={[styles.simpleEmptyText, { color: colors.secondaryText }]}>لا توجد فواتير مرتجعات</Text>
              </View>
            ) : (
              returns.map((ret, idx) => (
                <View
                  key={ret.id || idx}
                  style={[styles.simpleRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.rowCardRight}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>
                      مرتجع #{ret.return_number || ret.remote_id || idx + 1}
                    </Text>
                    <Text style={[styles.rowDate, { color: colors.secondaryText }]}>
                      {formatDate(ret.return_date)}
                    </Text>
                  </View>
                  <View style={styles.rowCardLeft}>
                    <Text style={[styles.rowAmount, { color: colors.warning }]}>
                      {formatCurrency(ret.net_amount || ret.total_amount)}
                    </Text>
                    {ret.status ? (
                      <Text style={[styles.rowStatusText, { color: colors.secondaryText }]}>
                        {ret.status}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))
            )
          )}

          {/* RECEIPTS / CASH LIST */}
          {selectedSection === 'receipts' && (
            receipts.length === 0 ? (
              <View style={[styles.simpleEmptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="cash-outline" size={38} color={colors.secondaryText} />
                <Text style={[styles.simpleEmptyText, { color: colors.secondaryText }]}>لا توجد حركات نقدية مسددة</Text>
              </View>
            ) : (
              receipts.map((rec, idx) => (
                <View
                  key={rec.id || idx}
                  style={[styles.simpleRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.rowCardRight}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>
                      إيصال #{rec.receipt_number || rec.remote_id || idx + 1}
                    </Text>
                    <Text style={[styles.rowDate, { color: colors.secondaryText }]}>
                      {formatDate(rec.receipt_date)}
                    </Text>
                  </View>
                  <View style={styles.rowCardLeft}>
                    <Text style={[styles.rowAmount, { color: colors.success }]}>
                      {formatCurrency(rec.amount)}
                    </Text>
                    <Text style={[styles.rowStatusText, { color: colors.secondaryText }]}>
                      {rec.payment_method || rec.notes || 'سداد نقدي'}
                    </Text>
                  </View>
                </View>
              ))
            )
          )}

          {/* STATEMENT LIST */}
          {selectedSection === 'statement' && (
            statement.length === 0 ? (
              <View style={[styles.simpleEmptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="receipt-outline" size={38} color={colors.secondaryText} />
                <Text style={[styles.simpleEmptyText, { color: colors.secondaryText }]}>لا توجد حركات كشف حساب</Text>
              </View>
            ) : (
              statement.map((stm, idx) => (
                <View
                  key={stm.id || idx}
                  style={[styles.simpleRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.rowCardRight}>
                    <Text style={[styles.rowTitle, { color: colors.text }]}>
                      {stm.doc_type || 'حركة'} #{stm.doc_number || stm.remote_id}
                    </Text>
                    <Text style={[styles.rowDate, { color: colors.secondaryText }]}>
                      {formatDate(stm.entry_date)}
                    </Text>
                    {stm.description ? (
                      <Text style={[styles.rowDescText, { color: colors.secondaryText }]} numberOfLines={1}>
                        {stm.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.rowCardLeft}>
                    {stm.debit > 0 && (
                      <Text style={[styles.rowAmount, { color: colors.primary }]}>
                        +{formatCurrency(stm.debit)}
                      </Text>
                    )}
                    {stm.credit > 0 && (
                      <Text style={[styles.rowAmount, { color: colors.success }]}>
                        -{formatCurrency(stm.credit)}
                      </Text>
                    )}
                    <Text style={[styles.statementBalText, { color: colors.secondaryText }]}>
                      الرصيد: {formatCurrency(stm.balance)}
                    </Text>
                  </View>
                </View>
              ))
            )
          )}
        </ScrollView>
      </View>
    );
  }

  // ----------------------------------------------------
  // STACKED CARDS DECK COMPONENT (اسم الصيدلية فقط - بدون إجمالي)
  // ----------------------------------------------------
  const renderStackedDeck = () => {
    const count = pharmacies.length;
    if (count === 0) return null;

    const activeItem = pharmacies[activePharmacyIndex] || pharmacies[0];
    const secondItem = count > 1 ? pharmacies[(activePharmacyIndex + 1) % count] : null;
    const thirdItem = count > 2 ? pharmacies[(activePharmacyIndex + 2) % count] : null;

    // Rotation interpolation: tilts naturally when dragging
    const rotate = pan.x.interpolate({
      inputRange: [-260, 0, 260],
      outputRange: ['-16deg', '0deg', '16deg'],
      extrapolate: 'clamp',
    });

    const activeOpacity = pan.x.interpolate({
      inputRange: [-260, -180, 0, 180, 260],
      outputRange: [0.35, 0.9, 1, 0.9, 0.35],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.deckWrapper}>
        <View style={[styles.deckContainer, { height: count > 2 ? 88 : count > 1 ? 80 : 70 }]}>
          {/* Card 3: الطبقة الثالثة العميقة */}
          {thirdItem && (
            <View
              style={[
                styles.stackedCard,
                styles.cardLayer3,
                { backgroundColor: colors.cardBack2, borderColor: colors.borderLayer3 },
              ]}
            >
              <View style={styles.cardContentSimple}>
                <View style={[styles.pharmacyIconBadge, { backgroundColor: '#FFFFFF66' }]}>
                  <Ionicons name="business" size={16} color={colors.primary} />
                </View>
                <Text style={[styles.cleanPharmacyName, { color: colors.secondaryText }]} numberOfLines={1}>
                  {thirdItem.pharmacy_name || `صيدلية #${thirdItem.pharmacy_code}`}
                </Text>
              </View>
            </View>
          )}

          {/* Card 2: الطبقة الثانية الوسطى */}
          {secondItem && (
            <View
              style={[
                styles.stackedCard,
                styles.cardLayer2,
                { backgroundColor: colors.cardBack, borderColor: colors.borderLayer2 },
              ]}
            >
              <View style={styles.cardContentSimple}>
                <View style={[styles.pharmacyIconBadge, { backgroundColor: '#FFFFFF99' }]}>
                  <Ionicons name="business" size={17} color={colors.primary} />
                </View>
                <Text style={[styles.cleanPharmacyName, { color: colors.text }]} numberOfLines={1}>
                  {secondItem.pharmacy_name || `صيدلية #${secondItem.pharmacy_code}`}
                </Text>
              </View>
            </View>
          )}

          {/* Card 1: البطاقة الأولى الأمامية التفاعلية (كأنك بتطير ورقة) */}
          <Animated.View
            {...(count > 1 ? panResponder.panHandlers : {})}
            style={[
              styles.stackedCard,
              styles.cardLayer1,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: activeOpacity,
                transform: [
                  { translateX: pan.x },
                  { translateY: pan.y },
                  { rotate: rotate },
                ],
              },
            ]}
          >
            <View style={styles.cardContentSimple}>
              <View style={[styles.pharmacyIconBadge, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="business" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.cleanPharmacyName, { color: colors.text }]} numberOfLines={1}>
                {activeItem.pharmacy_name || `صيدلية #${activeItem.pharmacy_code}`}
              </Text>
              {count > 1 && (
                <View style={[styles.cardOrderPill, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.cardOrderPillText, { color: colors.primary }]}>
                    {activePharmacyIndex + 1}/{count}
                  </Text>
                </View>
              )}
            </View>
          </Animated.View>
        </View>

        {/* مؤشر التنقل والتمرير عند وجود أكثر من صيدلية */}
        {count > 1 && (
          <View style={styles.deckIndicatorRow}>
            <TouchableOpacity
              onPress={() => flyToPharmacy('prev')}
              style={styles.deckArrowBtn}
              activeOpacity={0.6}
            >
              <Ionicons name="chevron-forward" size={18} color={colors.secondaryText} />
            </TouchableOpacity>

            <View style={styles.deckDotsRow}>
              {pharmacies.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.deckDot,
                    idx === activePharmacyIndex
                      ? [styles.deckDotActive, { backgroundColor: colors.primary }]
                      : [styles.deckDotInactive, { backgroundColor: colors.border }],
                  ]}
                />
              ))}
              <Text style={[styles.deckHintText, { color: colors.secondaryText }]}>
                اسحب للتنقل بين الصيدليات
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => flyToPharmacy('next')}
              style={styles.deckArrowBtn}
              activeOpacity={0.6}
            >
              <Ionicons name="chevron-back" size={18} color={colors.secondaryText} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ----------------------------------------------------
  // MAIN PORTAL SCREEN (شاشة المخزن الرئيسية البسيطة)
  // ----------------------------------------------------
  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} translucent={false} />

      {/* Top Header: Simple back arrow on right, Title in center, Add button on left */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backBtnClean}
          onPress={onBack}
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topHeaderTitle, { color: colors.text }]}>حساب الصيدلية</Text>
        <TouchableOpacity
          style={styles.headerAddBtn}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.6}
        >
          <Ionicons name="add" size={26} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.mainScrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* كروت الصيدليات المتراكمة - اسم الصيدلية فقط */}
        {renderStackedDeck()}

        {/* كروت الأقسام الأربعة */}
        <View style={styles.cardsListContainer}>
          {sections.map((sec) => (
            <TouchableOpacity
              key={sec.key}
              style={[styles.sectionNavCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setSelectedSection(sec.key)}
              activeOpacity={0.7}
            >
              {/* الأيقونة الملونة يمين الكرت */}
              <View style={[styles.navIconBox, { backgroundColor: sec.bgColor }]}>
                <Ionicons name={sec.icon} size={22} color={sec.color} />
              </View>

              {/* تفاصيل الكرت في المنتصف */}
              <View style={styles.navInfoCol}>
                <Text style={[styles.navTitle, { color: colors.text }]}>
                  {sec.title}
                </Text>
                <Text style={[styles.navDesc, { color: colors.secondaryText }]} numberOfLines={1}>
                  {sec.desc}
                </Text>
              </View>

              {/* سهم الانتقال شمال الكرت */}
              <View style={styles.navActionCol}>
                <Ionicons name="chevron-back" size={20} color={colors.secondaryText} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* نافذة التحقق وإضافة صيدلية أخرى لنفس المخزن */}
      <PharmacyVerifyModal
        visible={showAddModal}
        warehouse={warehouse}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />

      {/* شاشة اللودر بحجم الصفحة بالكامل زي صفحة البداية بالظبط */}
      {(isSwitchingPharmacy || loading) && (
        <View style={[styles.fullScreenLogoOverlay, { top: -topInset, bottom: -insets.bottom }]}>
          <View style={styles.fullScreenLogoSection}>
            <XLogo
              key={loaderAnimKey}
              width={width}
              height={Math.min(height * 0.72, 580)}
              resizeMode="contain"
              loop={true}
              speed={1.2}
            />
          </View>
          <Text style={[styles.fullScreenBottomText, { paddingBottom: Math.max(insets.bottom, 28) }]}>
            جاري تحميل بيانات الصيدلية
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtnClean: {
    padding: 6,
  },
  topHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerAddBtn: {
    padding: 6,
    borderRadius: 12,
  },
  topHeaderSpacer: {
    width: 36,
  },
  scrollArea: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 16,
  },
  subPageScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 10,
  },

  // حاوية بطاقات الطبقات المتراكمة (Deck)
  deckWrapper: {
    gap: 8,
    marginTop: 4,
    marginBottom: 4,
  },
  deckContainer: {
    position: 'relative',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  stackedCard: {
    position: 'absolute',
    height: 68,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    justifyContent: 'center',
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  cardLayer1: {
    zIndex: 10,
    top: 0,
    width: '100%',
  },
  cardLayer2: {
    zIndex: 9,
    top: 8,
    width: '94%',
  },
  cardLayer3: {
    zIndex: 8,
    top: 16,
    width: '88%',
  },
  cardContentSimple: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pharmacyIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cleanPharmacyName: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    flex: 1,
  },
  cardOrderPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  cardOrderPillText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // مؤشر البطاقات والأسهم
  deckIndicatorRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginTop: 2,
  },
  deckDotsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  deckDot: {
    height: 5,
    borderRadius: 3,
  },
  deckDotActive: {
    width: 18,
  },
  deckDotInactive: {
    width: 6,
  },
  deckHintText: {
    fontSize: 11,
    fontWeight: '600',
    marginRight: 6,
  },
  deckArrowBtn: {
    padding: 6,
  },

  // شاشة اللوجو الكاملة لتغطية الصفحة بالكامل زي صفحة البداية
  fullScreenLogoOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#F9F7FD',
    zIndex: 999999,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
  },
  fullScreenLogoSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  fullScreenBottomText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#7B6F93',
    textAlign: 'center',
  },

  // كروت الأقسام الأربعة في الصفحة الرئيسية
  cardsListContainer: {
    gap: 12,
  },
  sectionNavCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
    gap: 14,
  },
  navIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navInfoCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 3,
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  navDesc: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
  },
  navActionCol: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // بار ملخص القسم في الصفحة المنفصلة
  sectionSummaryBar: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
  },
  summaryBarCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  summaryBarDesc: {
    fontSize: 12,
    fontWeight: '600',
  },
  summaryBarAmount: {
    fontSize: 17,
    fontWeight: '900',
  },
  summaryCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginLeft: 8,
  },
  summaryCountText: {
    fontSize: 12,
    fontWeight: '800',
  },

  // صفوف القوائم البسيطة (بدون رغي ولا عك)
  simpleRowCard: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  rowCardRight: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 3,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  rowDate: {
    fontSize: 11,
    fontWeight: '500',
  },
  rowDescText: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'right',
  },
  rowCardLeft: {
    alignItems: 'flex-start',
    gap: 3,
    marginLeft: 10,
  },
  rowAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  rowStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  statementBalText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // حالة القائمة الفارغة
  simpleEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    marginTop: 20,
  },
  simpleEmptyText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
