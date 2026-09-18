import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
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
import SubscriptionModal from '@/components/SubscriptionModal';
import XLogo from '@/components/XLogo';
import {
  fetchPharmacyBalance,
  fetchPharmacyPurchases,
  fetchInvoiceDetails,
  fetchReturnDetails,
  fetchPharmacyReceipts,
  fetchPharmacyReturns,
  fetchPharmacyStatement,
  getWarehousePharmacies,
  saveWarehousePharmacy,
  InvoiceItem,
  InvoiceLineItem,
  LinkedPharmacyAccount,
  PharmacyBalance,
  ReceiptItem,
  ReturnItem,
  StatementItem,
  VerifyPharmacyResult,
  Warehouse,
} from '@/services/warehouse';
import {
  checkCanAddPharmacy,
  getSubscriptionStatus,
  registerGlobalPharmacy,
} from '@/services/subscription';
import { useAuth } from '@/context/AuthContext';

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
  const { user } = useAuth();
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

  // Subscription & Trial state
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [subscriptionReason, setSubscriptionReason] = useState<string | undefined>();
  const [subscriptionRequiredPlan, setSubscriptionRequiredPlan] = useState<number>(2);
  const [isTrialExpired, setIsTrialExpired] = useState(false);

  // Animation values for the flying paper effect
  const pan = useRef(new Animated.ValueXY()).current;
  const pharmaciesRef = useRef(pharmacies);
  pharmaciesRef.current = pharmacies;
  const activeIndexRef = useRef(activePharmacyIndex);
  activeIndexRef.current = activePharmacyIndex;

  const [balance, setBalance] = useState<PharmacyBalance | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceItem | null>(null);
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLineItem[]>([]);
  const [loadingInvoiceLines, setLoadingInvoiceLines] = useState(false);
  const [showInvoiceInfoModal, setShowInvoiceInfoModal] = useState(false);
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [selectedReturn, setSelectedReturn] = useState<ReturnItem | null>(null);
  const [returnLines, setReturnLines] = useState<InvoiceLineItem[]>([]);
  const [loadingReturnLines, setLoadingReturnLines] = useState(false);
  const [showReturnInfoModal, setShowReturnInfoModal] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [statement, setStatement] = useState<StatementItem[]>([]);

  // Pagination & infinite scroll states
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const offsetsRef = useRef({ purchases: 0, returns: 0, receipts: 0, statement: 0 });
  const [hasMoreInvoices, setHasMoreInvoices] = useState(true);
  const [hasMoreReturns, setHasMoreReturns] = useState(true);
  const [hasMoreReceipts, setHasMoreReceipts] = useState(true);
  const [hasMoreStatement, setHasMoreStatement] = useState(true);

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

  // Handle Android hardware/gesture back button: step back hierarchically
  useEffect(() => {
    const onBackPress = () => {
      // 0. If invoice/return info modal is open, close it
      if (showInvoiceInfoModal) {
        setShowInvoiceInfoModal(false);
        return true;
      }
      if (showReturnInfoModal) {
        setShowReturnInfoModal(false);
        return true;
      }
      // 1. If subscription modal is open and trial not strictly expired, close it
      if (showSubscriptionModal && !isTrialExpired) {
        setShowSubscriptionModal(false);
        return true;
      }
      // 2. If add pharmacy modal is open, close it
      if (showAddModal) {
        setShowAddModal(false);
        return true;
      }
      // 3. If viewing invoice details inside purchases, return to purchases list
      if (selectedInvoice) {
        setSelectedInvoice(null);
        setInvoiceLines([]);
        return true;
      }
      // 3b. If viewing return details inside returns, return to returns list
      if (selectedReturn) {
        setSelectedReturn(null);
        setReturnLines([]);
        return true;
      }
      // 4. If inside a section (purchases/returns/etc.), go back to portal main view
      if (selectedSection) {
        setSelectedSection(null);
        return true;
      }
      // 5. Otherwise, go back to main warehouses screen
      onBack();
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [showSubscriptionModal, isTrialExpired, showAddModal, selectedInvoice, selectedReturn, showInvoiceInfoModal, showReturnInfoModal, selectedSection, onBack]);

  // Initialize and load saved pharmacies for this warehouse
  useEffect(() => {
    const initPharmacies = async () => {
      if (pharmacyCode && pharmacyName) {
        await registerGlobalPharmacy(pharmacyCode, pharmacyName);
      }
      const subStatus = await getSubscriptionStatus(user?.email);
      if (subStatus.isTrialExpired) {
        setIsTrialExpired(true);
        setSubscriptionReason('انتهت الفترة التجريبية (7 أيام). يرجى الاشتراك للاستمرار.');
        setSubscriptionRequiredPlan(Math.max(1, subStatus.linkedPharmaciesCount));
        setShowSubscriptionModal(true);
      }

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
  }, [warehouse.id, token, pharmacyCode, pharmacyName]);

  const loadData = async (targetToken = currentToken, showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [bal, invs, rets, recs, stmts] = await Promise.all([
        fetchPharmacyBalance(targetToken),
        fetchPharmacyPurchases(targetToken, 20, 0),
        fetchPharmacyReturns(targetToken, 20, 0),
        fetchPharmacyReceipts(targetToken, 20, 0),
        fetchPharmacyStatement(targetToken, 20, 0),
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

      offsetsRef.current = {
        purchases: (invs || []).length,
        returns: (rets || []).length,
        receipts: (recs || []).length,
        statement: (stmts || []).length,
      };

      setHasMoreInvoices((invs || []).length >= 20);
      setHasMoreReturns((rets || []).length >= 20);
      setHasMoreReceipts((recs || []).length >= 20);
      setHasMoreStatement((stmts || []).length >= 20);
    } catch (e) {
      console.error('Error loading pharmacy data:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Infinite scroll loader: loads 20 more items for current section smoothly
  const loadMoreData = async () => {
    if (loadingMoreRef.current || !selectedSection) return;

    if (selectedSection === 'purchases') {
      if (!hasMoreInvoices) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      try {
        const offset = offsetsRef.current.purchases;
        const nextBatch = await fetchPharmacyPurchases(currentToken, 20, offset);
        offsetsRef.current.purchases += (nextBatch?.length || 0);

        if (!nextBatch || nextBatch.length < 20) {
          setHasMoreInvoices(false);
        }
        const validBatch = (nextBatch || []).filter(
          (inv) => (inv.net_amount ?? inv.total_amount ?? 0) > 0
        );
        if (validBatch.length > 0) {
          setInvoices((prev) => {
            const existingIds = new Set(prev.map((i) => i.id || i.remote_id || i.invoice_number));
            const uniqueNew = validBatch.filter(
              (i) => !existingIds.has(i.id || i.remote_id || i.invoice_number)
            );
            return [...prev, ...uniqueNew];
          });
        }
      } catch (err) {
        console.error('Error loading more purchases:', err);
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    } else if (selectedSection === 'returns') {
      if (!hasMoreReturns) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      try {
        const offset = offsetsRef.current.returns;
        const nextBatch = await fetchPharmacyReturns(currentToken, 20, offset);
        offsetsRef.current.returns += (nextBatch?.length || 0);

        if (!nextBatch || nextBatch.length < 20) {
          setHasMoreReturns(false);
        }
        const validBatch = (nextBatch || []).filter(
          (ret) => (ret.net_amount ?? ret.total_amount ?? 0) > 0
        );
        if (validBatch.length > 0) {
          setReturns((prev) => {
            const existingIds = new Set(prev.map((i) => i.id || i.remote_id || i.return_number));
            const uniqueNew = validBatch.filter(
              (i) => !existingIds.has(i.id || i.remote_id || i.return_number)
            );
            return [...prev, ...uniqueNew];
          });
        }
      } catch (err) {
        console.error('Error loading more returns:', err);
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    } else if (selectedSection === 'receipts') {
      if (!hasMoreReceipts) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      try {
        const offset = offsetsRef.current.receipts;
        const nextBatch = await fetchPharmacyReceipts(currentToken, 20, offset);
        offsetsRef.current.receipts += (nextBatch?.length || 0);

        if (!nextBatch || nextBatch.length < 20) {
          setHasMoreReceipts(false);
        }
        const validBatch = (nextBatch || []).filter((rec) => (rec.amount ?? 0) > 0);
        if (validBatch.length > 0) {
          setReceipts((prev) => {
            const existingIds = new Set(prev.map((i) => i.id || i.remote_id || i.receipt_number));
            const uniqueNew = validBatch.filter(
              (i) => !existingIds.has(i.id || i.remote_id || i.receipt_number)
            );
            return [...prev, ...uniqueNew];
          });
        }
      } catch (err) {
        console.error('Error loading more receipts:', err);
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    } else if (selectedSection === 'statement') {
      if (!hasMoreStatement) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      try {
        const offset = offsetsRef.current.statement;
        const nextBatch = await fetchPharmacyStatement(currentToken, 20, offset);
        offsetsRef.current.statement += (nextBatch?.length || 0);

        if (!nextBatch || nextBatch.length < 20) {
          setHasMoreStatement(false);
        }
        const validBatch = (nextBatch || []).filter(
          (stm) => (stm.debit ?? 0) > 0 || (stm.credit ?? 0) > 0
        );
        if (validBatch.length > 0) {
          setStatement((prev) => {
            const existingIds = new Set(
              prev.map((i) => i.id || i.remote_id || `${i.doc_number}_${i.entry_date}`)
            );
            const uniqueNew = validBatch.filter(
              (i) => !existingIds.has(i.id || i.remote_id || `${i.doc_number}_${i.entry_date}`)
            );
            return [...prev, ...uniqueNew];
          });
        }
      } catch (err) {
        console.error('Error loading more statement:', err);
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (loadingMoreRef.current) return;
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 120;
    if (isCloseToBottom) {
      loadMoreData();
    }
  };

  useEffect(() => {
    loadData(currentToken, true);
  }, [currentToken]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (selectedInvoice) {
      const targetId = selectedInvoice.id || selectedInvoice.remote_id || selectedInvoice.invoice_number;
      try {
        const details = await fetchInvoiceDetails(currentToken, targetId);
        if (details.items && details.items.length > 0) {
          setInvoiceLines(details.items);
        }
      } catch (e) {
        console.error(e);
      }
    }
    if (selectedReturn) {
      const targetId = selectedReturn.id || selectedReturn.remote_id || selectedReturn.return_number || '';
      try {
        const details = await fetchReturnDetails(currentToken, targetId);
        if (details.items && details.items.length > 0) {
          setReturnLines(details.items);
        }
      } catch (e) {
        console.error(e);
      }
    }
    await loadData(currentToken, false);
    setRefreshing(false);
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

  // Check if pharmacist can add a new pharmacy before opening modal
  const handlePressAddPharmacy = async () => {
    const check = await checkCanAddPharmacy(user?.email);
    if (!check.canAdd) {
      setSubscriptionReason(check.reason);
      setSubscriptionRequiredPlan(check.requiredPlan || 2);
      setIsTrialExpired(check.isTrialExpired);
      setShowSubscriptionModal(true);
      return;
    }
    setShowAddModal(true);
  };

  // When a new pharmacy is verified and added
  const handleAddSuccess = async (result: VerifyPharmacyResult) => {
    if (!result.token) return;
    await registerGlobalPharmacy(result.pharmacy_code || '', result.pharmacy_name || '');
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

  const handleInvoicePress = async (inv: InvoiceItem) => {
    setSelectedInvoice(inv);
    setLoadingInvoiceLines(true);
    const targetId = inv.id || inv.remote_id || inv.invoice_number;
    try {
      const details = await fetchInvoiceDetails(currentToken, targetId);
      if (details.items && details.items.length > 0) {
        setInvoiceLines(details.items);
      } else {
        // Fallback: create item from invoice if no line items found in DB
        setInvoiceLines([
          {
            id: 'fallback-1',
            item_name: 'أدوية ومستلزمات عامة (فاتورة مسجلة)',
            quantity: 1,
            unit_price: inv.total_amount || inv.net_amount || 0,
            discount_percent:
              inv.total_amount && inv.discount_amount
                ? Math.round((inv.discount_amount / inv.total_amount) * 100)
                : 0,
            total_price: inv.net_amount || inv.total_amount || 0,
          },
        ]);
      }
    } catch (e) {
      console.error('Error fetching invoice lines:', e);
    } finally {
      setLoadingInvoiceLines(false);
    }
  };

  const handleReturnPress = async (ret: ReturnItem) => {
    setSelectedReturn(ret);
    setLoadingReturnLines(true);
    const targetId = ret.id || ret.remote_id || ret.return_number || '';
    try {
      const details = await fetchReturnDetails(currentToken, targetId);
      if (details.items && details.items.length > 0) {
        setReturnLines(details.items);
      } else {
        // Fallback: show the return entry item
        setReturnLines([
          {
            id: 'ret-fb-1',
            item_name: ret.reason || 'أدوية ومستحضرات مرتجعة للمخزن',
            quantity: 1,
            unit_price: ret.net_amount || ret.total_amount || 0,
            discount_percent: 0,
            total_price: ret.net_amount || ret.total_amount || 0,
          },
        ]);
      }
    } catch (e) {
      console.error('Error fetching return lines:', e);
      setReturnLines([
        {
          id: 'ret-fb-1',
          item_name: ret.reason || 'أدوية ومستحضرات مرتجعة للمخزن',
          quantity: 1,
          unit_price: ret.net_amount || ret.total_amount || 0,
          discount_percent: 0,
          total_price: ret.net_amount || ret.total_amount || 0,
        },
      ]);
    } finally {
      setLoadingReturnLines(false);
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

    // 1. DEDICATED INVOICE DETAILS SCREEN (صفحة تفاصيل الفاتورة - مثل شاشة التطبيق القديم تماماً)
    if (selectedSection === 'purchases' && selectedInvoice) {
      return (
        <View style={[styles.container, { backgroundColor: '#F8F9FB', paddingTop: topInset }]}>
          <StatusBar barStyle="dark-content" backgroundColor="#F8F9FB" translucent={false} />

          {/* Header Bar matching screenshot */}
          <View style={styles.tabarakTopHeader}>
            <TouchableOpacity
              style={styles.tabarakHeaderIconBtn}
              onPress={() => setShowInvoiceInfoModal(true)}
              activeOpacity={0.6}
            >
              <Ionicons name="information-circle-outline" size={28} color="#1a2b6d" />
            </TouchableOpacity>

            <View style={styles.tabarakHeaderTitleBox}>
              <Text style={styles.tabarakHeaderMainTitle}>فاتورة شراء</Text>
              <View style={styles.tabarakHeaderActiveIndicator} />
            </View>

            <TouchableOpacity
              style={styles.tabarakHeaderIconBtn}
              onPress={() => {
                setSelectedInvoice(null);
                setInvoiceLines([]);
              }}
              activeOpacity={0.6}
            >
              <Ionicons name="chevron-forward" size={28} color="#1a2b6d" />
            </TouchableOpacity>
          </View>

          {/* Line Items List */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.tabarakScrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
            }
          >
            {loadingInvoiceLines ? (
              <View style={styles.invoiceLoadingBox}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.invoiceLoadingText, { color: colors.secondaryText }]}>
                  جاري جلب تفاصيل الأصناف...
                </Text>
              </View>
            ) : invoiceLines.length === 0 ? (
              <View style={[styles.simpleEmptyBox, { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }]}>
                <Ionicons name="receipt-outline" size={38} color={colors.secondaryText} />
                <Text style={[styles.simpleEmptyText, { color: colors.secondaryText }]}>
                  لا توجد بنود مسجلة في هذه الفاتورة
                </Text>
              </View>
            ) : (
              invoiceLines.map((item, idx) => {
                const qty = item.quantity ?? 1;
                const price = item.unit_price ?? 0;
                const discount = item.discount_percent ?? 0;
                const total = item.total_price ?? (qty * price * (1 - discount / 100));

                return (
                  <View
                    key={item.id || `inv-item-${idx}`}
                    style={styles.tabarakItemCard}
                  >
                    {/* اسم الصنف */}
                    <View style={styles.tabarakItemTop}>
                      <Text style={styles.tabarakItemName} numberOfLines={2}>
                        {item.item_name}
                      </Text>
                    </View>

                    {/* خط فاصل رمادي خفيف */}
                    <View style={styles.tabarakItemDivider} />

                    {/* 4 أعمدة: الكمية | السعر | الخصم | الإجمالي */}
                    <View style={styles.tabarakItemBottomRow}>
                      {/* 1. الكمية */}
                      <View style={styles.tabarakCol}>
                        <Text style={styles.tabarakColLabel}>الكمية</Text>
                        <Text style={styles.tabarakColValue}>
                          {qty}
                          {item.bonus_quantity && item.bonus_quantity > 0 ? (
                            <Text style={{ color: '#10B981', fontSize: 11 }}> +{item.bonus_quantity}</Text>
                          ) : null}
                        </Text>
                      </View>

                      {/* 2. السعر */}
                      <View style={styles.tabarakCol}>
                        <Text style={styles.tabarakColLabel}>السعر</Text>
                        <Text style={styles.tabarakColValue}>
                          {price.toFixed(2)}
                        </Text>
                      </View>

                      {/* 3. الخصم */}
                      <View style={styles.tabarakCol}>
                        <Text style={[styles.tabarakColLabel, { color: '#EF4444' }]}>الخصم</Text>
                        <Text style={[styles.tabarakColValue, { color: '#EF4444' }]}>
                          {discount > 0 ? `${Math.round(discount)}%` : '0%'}
                        </Text>
                      </View>

                      {/* 4. الإجمالي */}
                      <View style={styles.tabarakCol}>
                        <Text style={[styles.tabarakColLabel, { color: '#2563EB' }]}>الإجمالي</Text>
                        <Text style={[styles.tabarakColValue, { color: '#2563EB', fontWeight: '800' }]}>
                          {total.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Modal Info for Invoice Header */}
          <Modal
            visible={showInvoiceInfoModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowInvoiceInfoModal(false)}
          >
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => setShowInvoiceInfoModal(false)}
            >
              <TouchableOpacity
                style={[styles.modalCard, { backgroundColor: '#FFFFFF' }]}
                activeOpacity={1}
              >
                <View style={styles.modalHeaderRow}>
                  <TouchableOpacity onPress={() => setShowInvoiceInfoModal(false)}>
                    <Ionicons name="close-circle-outline" size={26} color={colors.secondaryText} />
                  </TouchableOpacity>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>تفاصيل الفاتورة</Text>
                </View>

                <View style={styles.modalBody}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>رقم الفاتورة</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {selectedInvoice.invoice_number || selectedInvoice.remote_id}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>تاريخ الفاتورة</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {formatDate(selectedInvoice.invoice_date)}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>إجمالي الفاتورة</Text>
                    <Text style={[styles.infoValue, { color: colors.primary }]}>
                      {formatCurrency(selectedInvoice.total_amount || selectedInvoice.net_amount)}
                    </Text>
                  </View>
                  {selectedInvoice.discount_amount ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>الخصم</Text>
                      <Text style={[styles.infoValue, { color: '#EF4444' }]}>
                        {formatCurrency(selectedInvoice.discount_amount)}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>الصافي</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {formatCurrency(selectedInvoice.net_amount || selectedInvoice.total_amount)}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>حالة الفاتورة</Text>
                    <Text style={[styles.infoValue, { color: colors.success }]}>
                      {selectedInvoice.status || 'مسجلة'}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>عدد الأصناف</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {invoiceLines.length} صنف
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.modalCloseBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setShowInvoiceInfoModal(false)}
                >
                  <Text style={styles.modalCloseBtnText}>إغلاق</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </View>
      );
    }

    // 2. DEDICATED RETURN DETAILS SCREEN (صفحة تفاصيل فاتورة المرتجع)
    if (selectedSection === 'returns' && selectedReturn) {
      return (
        <View style={[styles.container, { backgroundColor: '#F8F9FB', paddingTop: topInset }]}>
          <StatusBar barStyle="dark-content" backgroundColor="#F8F9FB" translucent={false} />

          {/* Header Bar */}
          <View style={styles.tabarakTopHeader}>
            <TouchableOpacity
              style={styles.tabarakHeaderIconBtn}
              onPress={() => setShowReturnInfoModal(true)}
              activeOpacity={0.6}
            >
              <Ionicons name="information-circle-outline" size={28} color="#1a2b6d" />
            </TouchableOpacity>

            <View style={styles.tabarakHeaderTitleBox}>
              <Text style={styles.tabarakHeaderMainTitle}>فاتورة مرتجع</Text>
              <View style={[styles.tabarakHeaderActiveIndicator, { backgroundColor: '#F59E0B' }]} />
            </View>

            <TouchableOpacity
              style={styles.tabarakHeaderIconBtn}
              onPress={() => {
                setSelectedReturn(null);
                setReturnLines([]);
              }}
              activeOpacity={0.6}
            >
              <Ionicons name="chevron-forward" size={28} color="#1a2b6d" />
            </TouchableOpacity>
          </View>

          {/* Line Items List */}
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.tabarakScrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F59E0B']} />
            }
          >
            {loadingReturnLines ? (
              <View style={styles.invoiceLoadingBox}>
                <ActivityIndicator size="small" color="#F59E0B" />
                <Text style={[styles.invoiceLoadingText, { color: colors.secondaryText }]}>
                  جاري جلب تفاصيل الأصناف المرتجعة...
                </Text>
              </View>
            ) : returnLines.length === 0 ? (
              <View style={[styles.simpleEmptyBox, { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }]}>
                <Ionicons name="arrow-undo-outline" size={38} color={colors.secondaryText} />
                <Text style={[styles.simpleEmptyText, { color: colors.secondaryText }]}>
                  لا توجد بنود مسجلة في هذا المرتجع
                </Text>
              </View>
            ) : (
              returnLines.map((item, idx) => {
                const qty = item.quantity ?? 1;
                const price = item.unit_price ?? 0;
                const discount = item.discount_percent ?? 0;
                const total = item.total_price ?? (qty * price * (1 - discount / 100));

                return (
                  <View
                    key={item.id || `ret-item-${idx}`}
                    style={styles.tabarakItemCard}
                  >
                    {/* اسم الصنف */}
                    <View style={styles.tabarakItemTop}>
                      <Text style={styles.tabarakItemName} numberOfLines={2}>
                        {item.item_name}
                      </Text>
                    </View>

                    {/* خط فاصل رمادي خفيف */}
                    <View style={styles.tabarakItemDivider} />

                    {/* 4 أعمدة: الكمية | السعر | الخصم | الإجمالي */}
                    <View style={styles.tabarakItemBottomRow}>
                      {/* 1. الكمية */}
                      <View style={styles.tabarakCol}>
                        <Text style={styles.tabarakColLabel}>الكمية</Text>
                        <Text style={styles.tabarakColValue}>
                          {qty}
                        </Text>
                      </View>

                      {/* 2. السعر */}
                      <View style={styles.tabarakCol}>
                        <Text style={styles.tabarakColLabel}>السعر</Text>
                        <Text style={styles.tabarakColValue}>
                          {price.toFixed(2)}
                        </Text>
                      </View>

                      {/* 3. الخصم */}
                      <View style={styles.tabarakCol}>
                        <Text style={[styles.tabarakColLabel, { color: '#EF4444' }]}>الخصم</Text>
                        <Text style={[styles.tabarakColValue, { color: '#EF4444' }]}>
                          {discount > 0 ? `${Math.round(discount)}%` : '0%'}
                        </Text>
                      </View>

                      {/* 4. الإجمالي */}
                      <View style={styles.tabarakCol}>
                        <Text style={[styles.tabarakColLabel, { color: '#F59E0B' }]}>الإجمالي</Text>
                        <Text style={[styles.tabarakColValue, { color: '#F59E0B', fontWeight: '800' }]}>
                          {total.toFixed(2)}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>

          {/* Modal Info for Return Header */}
          <Modal
            visible={showReturnInfoModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowReturnInfoModal(false)}
          >
            <TouchableOpacity
              style={styles.modalBackdrop}
              activeOpacity={1}
              onPress={() => setShowReturnInfoModal(false)}
            >
              <TouchableOpacity
                style={[styles.modalCard, { backgroundColor: '#FFFFFF' }]}
                activeOpacity={1}
              >
                <View style={styles.modalHeaderRow}>
                  <TouchableOpacity onPress={() => setShowReturnInfoModal(false)}>
                    <Ionicons name="close-circle-outline" size={26} color={colors.secondaryText} />
                  </TouchableOpacity>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>تفاصيل المرتجع</Text>
                </View>

                <View style={styles.modalBody}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>رقم المرتجع</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {selectedReturn.return_number || selectedReturn.remote_id}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>تاريخ المرتجع</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {formatDate(selectedReturn.return_date)}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>إجمالي المرتجع</Text>
                    <Text style={[styles.infoValue, { color: '#F59E0B' }]}>
                      {formatCurrency(selectedReturn.net_amount || selectedReturn.total_amount)}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>حالة المرتجع</Text>
                    <Text style={[styles.infoValue, { color: colors.success }]}>
                      {selectedReturn.status || 'معتمد'}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>عدد الأصناف</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {returnLines.length} صنف
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.modalCloseBtn, { backgroundColor: '#F59E0B' }]}
                  onPress={() => setShowReturnInfoModal(false)}
                >
                  <Text style={styles.modalCloseBtnText}>إغلاق</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </View>
      );
    }

    const renderPurchasesItem = ({ item: inv }: { item: InvoiceItem }) => (
      <TouchableOpacity
        key={inv.id || inv.remote_id}
        activeOpacity={0.7}
        onPress={() => handleInvoicePress(inv)}
        style={[styles.simpleRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={styles.rowCardRight}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              فاتورة #{inv.invoice_number || inv.remote_id}
            </Text>
            <Ionicons name="chevron-back" size={14} color={colors.secondaryText} />
          </View>
          <Text style={[styles.rowDate, { color: colors.secondaryText }]}>
            {formatDate(inv.invoice_date)}
          </Text>
        </View>
        <View style={styles.rowCardLeft}>
          <Text style={[styles.rowAmount, { color: colors.primary }]}>
            {formatCurrency(inv.total_amount || inv.net_amount)}
          </Text>
          {inv.status ? (
            <Text style={[styles.rowStatusText, { color: colors.secondaryText }]}>
              {inv.status}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );

    const renderReturnsItem = ({ item: ret, index: idx }: { item: ReturnItem; index: number }) => (
      <TouchableOpacity
        key={ret.id || ret.remote_id}
        activeOpacity={0.7}
        onPress={() => handleReturnPress(ret)}
        style={[styles.simpleRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View style={styles.rowCardRight}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              مرتجع #{ret.return_number || ret.remote_id || idx + 1}
            </Text>
            <Ionicons name="chevron-back" size={14} color={colors.secondaryText} />
          </View>
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
      </TouchableOpacity>
    );

    const renderReceiptsItem = ({ item: rec, index: idx }: { item: ReceiptItem; index: number }) => (
      <View
        key={rec.id || rec.remote_id}
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
    );

    const renderStatementItem = ({ item: stm }: { item: StatementItem }) => (
      <View
        key={stm.id || stm.remote_id}
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
    );

    const getSectionData = () => {
      if (selectedSection === 'purchases') return invoices;
      if (selectedSection === 'returns') return returns;
      if (selectedSection === 'receipts') return receipts;
      if (selectedSection === 'statement') return statement;
      return [];
    };

    const renderSectionItem = ({ item, index }: { item: any; index: number }) => {
      if (selectedSection === 'purchases') return renderPurchasesItem({ item });
      if (selectedSection === 'returns') return renderReturnsItem({ item, index });
      if (selectedSection === 'receipts') return renderReceiptsItem({ item, index });
      if (selectedSection === 'statement') return renderStatementItem({ item });
      return null;
    };

    return (
      <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset }]}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.bg} translucent={false} />

        {/* Section Page Header */}
        <View style={styles.topHeader}>
          <TouchableOpacity
            style={styles.backBtnClean}
            onPress={() => {
              setSelectedInvoice(null);
              setSelectedReturn(null);
              setSelectedSection(null);
            }}
            activeOpacity={0.6}
          >
            <Ionicons name="arrow-forward" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topHeaderTitle, { color: colors.text }]}>
            {currentSection?.title}
          </Text>
          <View style={styles.topHeaderSpacer} />
        </View>

        {/* Section List Content using Virtualized FlatList for High Performance */}
        <FlatList
          data={getSectionData()}
          renderItem={renderSectionItem}
          keyExtractor={(item, index) =>
            item.id || item.remote_id || item.invoice_number || item.return_number || item.receipt_number || String(index)
          }
          contentContainerStyle={styles.subPageScrollContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={5}
          onEndReached={loadMoreData}
          onEndReachedThreshold={0.5}
          removeClippedSubviews={Platform.OS === 'android'}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
          ListEmptyComponent={
            <View style={[styles.simpleEmptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons
                name={
                  selectedSection === 'purchases'
                    ? 'cart-outline'
                    : selectedSection === 'returns'
                    ? 'arrow-undo-outline'
                    : selectedSection === 'receipts'
                    ? 'cash-outline'
                    : 'receipt-outline'
                }
                size={38}
                color={colors.secondaryText}
              />
              <Text style={[styles.simpleEmptyText, { color: colors.secondaryText }]}>
                {selectedSection === 'purchases'
                  ? 'لا توجد فواتير مشتريات'
                  : selectedSection === 'returns'
                  ? 'لا توجد فواتير مرتجعات'
                  : selectedSection === 'receipts'
                  ? 'لا توجد حركات نقدية مسددة'
                  : 'لا توجد حركات كشف حساب'}
              </Text>
            </View>
          }
          ListFooterComponent={
            <>
              {loadingMore && (
                <View style={styles.loadingMoreBox}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={[styles.loadingMoreText, { color: colors.secondaryText }]}>
                    جاري تحميل 20 سجل إضافي...
                  </Text>
                </View>
              )}
              {!loadingMore &&
                ((selectedSection === 'purchases' && !hasMoreInvoices && invoices.length >= 20) ||
                  (selectedSection === 'returns' && !hasMoreReturns && returns.length >= 20) ||
                  (selectedSection === 'receipts' && !hasMoreReceipts && receipts.length >= 20) ||
                  (selectedSection === 'statement' && !hasMoreStatement && statement.length >= 20)) && (
                  <View style={styles.endOfListBox}>
                    <Text style={[styles.endOfListText, { color: colors.secondaryText }]}>
                      ✓ تم تحميل جميع السجلات
                    </Text>
                  </View>
                )}
              <View style={{ height: 30 }} />
            </>
          }
        />
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
        <Text style={[styles.topHeaderTitle, { color: colors.text }]} numberOfLines={1}>
          {warehouse.name || 'المخزن'}
        </Text>
        <TouchableOpacity
          style={styles.headerAddBtn}
          onPress={handlePressAddPharmacy}
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

      {/* نافذة خطط وباقات الاشتراك والفترة التجريبية */}
      <SubscriptionModal
        visible={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        reason={subscriptionReason}
        isTrialExpired={isTrialExpired}
        suggestedPlan={subscriptionRequiredPlan}
        onSubscribed={(plan) => {
          setShowSubscriptionModal(false);
          setIsTrialExpired(false);
        }}
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
    flex: 1,
    marginHorizontal: 8,
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

  invoiceLoadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 10,
  },
  invoiceLoadingText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // الشاشات الخاصة بتفاصيل الفاتورة مثل تطبيق تبارك
  tabarakTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F8F9FB',
  },
  tabarakHeaderIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabarakHeaderTitleBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabarakHeaderMainTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1a2b6d',
  },
  tabarakHeaderActiveIndicator: {
    width: 32,
    height: 3,
    backgroundColor: '#F97316',
    borderRadius: 2,
    marginTop: 4,
  },
  tabarakScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  tabarakItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EEF2F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  tabarakItemTop: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  tabarakItemName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
    width: '100%',
    lineHeight: 22,
  },
  tabarakItemDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
    width: '100%',
  },
  tabarakItemBottomRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tabarakCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabarakColLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  tabarakColValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  modalHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalBody: {
    gap: 12,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalCloseBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },

  loadingMoreBox: {
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 12,
    fontWeight: '600',
  },
  endOfListBox: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endOfListText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
