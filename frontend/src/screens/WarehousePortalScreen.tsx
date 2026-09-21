import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import UpgradeProrationModal from '@/components/UpgradeProrationModal';
import UnlinkedNoticeModal from '@/components/UnlinkedNoticeModal';
import SelectActivePharmaciesModal from '@/components/SelectActivePharmaciesModal';
import XLogo from '@/components/XLogo';
import {
  clearPharmacySession,
  fetchInvoiceDetails,
  fetchPharmacyBalance,
  fetchPharmacyPurchases,
  fetchPharmacyReceipts,
  fetchPharmacyReturns,
  fetchPharmacyStatement,
  fetchReturnDetails,
  fetchWarehouses,
  getWarehousePharmacies,
  savePharmacySession,
  saveWarehousePharmacy,
  syncWarehousePharmacies,
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
  checkCanAddPharmacyInWarehouse,
  getSubscriptionStatus,
  registerGlobalPharmacy,
  SubscriptionStatus,
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
  const [unlinkNoticeVisible, setUnlinkNoticeVisible] = useState(false);
  const [unlinkNoticeConfig, setUnlinkNoticeConfig] = useState<{
    message?: string;
    isSwitchBranch?: boolean;
    pharmacyName?: string;
    switchedToName?: string;
  }>({});

  // Subscription & Trial state
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [subscriptionReason, setSubscriptionReason] = useState<string | undefined>();
  const [subscriptionRequiredPlan, setSubscriptionRequiredPlan] = useState<number>(2);
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [showSelectActiveModal, setShowSelectActiveModal] = useState(false);
  const [subscriptionStatusInfo, setSubscriptionStatusInfo] = useState<SubscriptionStatus | null>(null);

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

  // In-memory line items cache for sub-millisecond instant opening
  const invoiceLinesCacheRef = useRef<Record<string, InvoiceLineItem[]>>({});
  const returnLinesCacheRef = useRef<Record<string, InvoiceLineItem[]>>({});

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
      // 0a. If unlinked notice modal is open, close it (and exit if not branch switch)
      if (unlinkNoticeVisible) {
        setUnlinkNoticeVisible(false);
        if (!unlinkNoticeConfig.isSwitchBranch) {
          onBack();
        }
        return true;
      }
      // 0. If invoice/return info modal is open, close it
      if (showInvoiceInfoModal) {
        setShowInvoiceInfoModal(false);
        return true;
      }
      if (showReturnInfoModal) {
        setShowReturnInfoModal(false);
        return true;
      }
      // 1. If upgrade or subscription modal is open, close it
      if (showUpgradeModal) {
        setShowUpgradeModal(false);
        return true;
      }
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
  }, [
    unlinkNoticeVisible,
    unlinkNoticeConfig,
    showUpgradeModal,
    showSubscriptionModal,
    isTrialExpired,
    showAddModal,
    selectedInvoice,
    selectedReturn,
    showInvoiceInfoModal,
    showReturnInfoModal,
    selectedSection,
    onBack,
  ]);

  // Initialize and load saved pharmacies for this warehouse
  useEffect(() => {
    const initPharmacies = async () => {
      if (pharmacyCode && pharmacyName) {
        await registerGlobalPharmacy(pharmacyCode, pharmacyName, user?.email, warehouse.id);
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

  const checkAndSyncPharmacies = async () => {
    if (!user?.email && !user?.id) return;
    try {
      const whList = await fetchWarehouses(user?.id, user?.email);
      const currentWh = whList.find((w) => w.id === warehouse.id);
      const serverPharmacies = (currentWh?.linked_pharmacies || []) as LinkedPharmacyAccount[];

      if (!currentWh?.is_linked || serverPharmacies.length === 0) {
        // All pharmacies in this warehouse were unlinked
        await clearPharmacySession(warehouse.id);
        setUnlinkNoticeConfig({
          message: 'تم إلغاء ربط صيدليتك في هذا المخزن من قبل إدارة المنصة.',
          isSwitchBranch: false,
          pharmacyName: currentPharmacyName,
        });
        setUnlinkNoticeVisible(true);
        return;
      }

      // Format server accounts
      const serverAccounts: LinkedPharmacyAccount[] = serverPharmacies.map((p) => ({
        token: p.token || '',
        pharmacy_code: (p as any).pharmacy_code || (p as any).code || '',
        pharmacy_name: (p as any).pharmacy_name || (p as any).name || '',
        tenant_id: warehouse.id,
        is_suspended: !!(p as any).is_suspended,
      }));

      await syncWarehousePharmacies(warehouse.id, serverAccounts);
      setPharmacies(serverAccounts);

      const subStatus = await getSubscriptionStatus(user?.email);
      setSubscriptionStatusInfo(subStatus);
      if (subStatus.hasOverflow && subStatus.requiresSelection) {
        setShowSelectActiveModal(true);
      }

      // Check if current active pharmacy is still in serverAccounts
      const isCurrentStillLinked = serverAccounts.some(
        (a) => a.pharmacy_code === currentPharmacyCode
      );

      if (!isCurrentStillLinked) {
        // The active pharmacy was unlinked! Switch to the first available linked pharmacy!
        const nextPharma = serverAccounts[0];
        await savePharmacySession(warehouse.id, nextPharma);
        setActivePharmacyIndex(0);
        setCurrentToken(nextPharma.token);
        setCurrentPharmacyCode(nextPharma.pharmacy_code);
        setCurrentPharmacyName(nextPharma.pharmacy_name);
        setUnlinkNoticeConfig({
          isSwitchBranch: true,
          pharmacyName: currentPharmacyName,
          switchedToName: nextPharma.pharmacy_name,
        });
        setUnlinkNoticeVisible(true);
        loadData(nextPharma.token, false);
      }
    } catch (e) {
      console.warn('Failed to check and sync warehouse pharmacies:', e);
    }
  };

  const loadData = async (targetToken = currentToken, showLoader = true) => {
    if (showLoader) setLoading(true);
    const activePh = pharmaciesRef.current[activeIndexRef.current];
    if (activePh && activePh.is_suspended) {
      setBalance(null);
      setInvoices([]);
      setReturns([]);
      setReceipts([]);
      setStatement([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
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
    invoiceLinesCacheRef.current = {};
    returnLinesCacheRef.current = {};
    await checkAndSyncPharmacies();
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

  // Switch active pharmacy branch smoothly
  const switchPharmacy = async (index: number) => {
    if (index === activePharmacyIndex || index < 0 || index >= pharmacies.length) return;
    const targetPh = pharmacies[index];
    if (!targetPh) return;

    activeIndexRef.current = index;
    setActivePharmacyIndex(index);
    setCurrentToken(targetPh.token);
    setCurrentPharmacyCode(targetPh.pharmacy_code);
    setCurrentPharmacyName(targetPh.pharmacy_name);

    await savePharmacySession(warehouse.id, targetPh);
    loadData(targetPh.token, true);
  };

  // Check if pharmacist can add a new pharmacy before opening modal
  const handlePressAddPharmacy = async () => {
    const check = await checkCanAddPharmacyInWarehouse(warehouse.id, pharmacies.length, user?.email);
    if (!check.canAdd) {
      setSubscriptionReason(check.reason);
      setSubscriptionRequiredPlan(check.requiredPlan || Math.min(5, pharmacies.length + 1));
      setIsTrialExpired(check.isTrialExpired || false);
      setShowUpgradeModal(true);
      return;
    }
    setShowAddModal(true);
  };

  // When a new pharmacy is verified and added
  const handleAddSuccess = async (result: VerifyPharmacyResult) => {
    if (!result.token) return;
    await registerGlobalPharmacy(result.pharmacy_code || '', result.pharmacy_name || '', user?.email, warehouse.id);
    setShowAddModal(false);

    const newAccount: LinkedPharmacyAccount = {
      token: result.token,
      pharmacy_code: result.pharmacy_code || '',
      pharmacy_name: result.pharmacy_name || 'الصيدلية',
      tenant_id: warehouse.id,
    };
    const updatedList = await saveWarehousePharmacy(warehouse.id, newAccount);
    setPharmacies(updatedList);
    activeIndexRef.current = 0;
    setActivePharmacyIndex(0);
    setCurrentToken(newAccount.token);
    setCurrentPharmacyCode(newAccount.pharmacy_code);
    setCurrentPharmacyName(newAccount.pharmacy_name);

    await loadData(newAccount.token, true);
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
    const targetId = inv.id || inv.remote_id || inv.invoice_number;

    // Instant check from in-memory cache
    if (invoiceLinesCacheRef.current[targetId] && invoiceLinesCacheRef.current[targetId].length > 0) {
      setInvoiceLines(invoiceLinesCacheRef.current[targetId]);
      setLoadingInvoiceLines(false);
      return;
    }

    setLoadingInvoiceLines(true);
    try {
      const details = await fetchInvoiceDetails(currentToken, targetId);
      if (details.items && details.items.length > 0) {
        invoiceLinesCacheRef.current[targetId] = details.items;
        setInvoiceLines(details.items);
      } else {
        // Fallback: create item from invoice if no line items found in DB
        const fallbackItems: InvoiceLineItem[] = [
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
        ];
        invoiceLinesCacheRef.current[targetId] = fallbackItems;
        setInvoiceLines(fallbackItems);
      }
    } catch (e) {
      console.error('Error fetching invoice lines:', e);
    } finally {
      setLoadingInvoiceLines(false);
    }
  };

  const handleReturnPress = async (ret: ReturnItem) => {
    setSelectedReturn(ret);
    const targetId = ret.id || ret.remote_id || ret.return_number || '';

    // Instant check from in-memory cache
    if (returnLinesCacheRef.current[targetId] && returnLinesCacheRef.current[targetId].length > 0) {
      setReturnLines(returnLinesCacheRef.current[targetId]);
      setLoadingReturnLines(false);
      return;
    }

    setLoadingReturnLines(true);
    try {
      const details = await fetchReturnDetails(currentToken, targetId);
      if (details.items && details.items.length > 0) {
        returnLinesCacheRef.current[targetId] = details.items;
        setReturnLines(details.items);
      } else {
        // Fallback: show the return entry item
        const fallbackItems: InvoiceLineItem[] = [
          {
            id: 'ret-fb-1',
            item_name: ret.reason || 'أدوية ومستحضرات مرتجعة للمخزن',
            quantity: 1,
            unit_price: ret.net_amount || ret.total_amount || 0,
            discount_percent: 0,
            total_price: ret.net_amount || ret.total_amount || 0,
          },
        ];
        returnLinesCacheRef.current[targetId] = fallbackItems;
        setReturnLines(fallbackItems);
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

          {/* Fixed Footer Summary for the Invoice */}
          <View style={styles.invoiceFooterBar}>
            <View style={styles.invoiceFooterRow}>
              <View style={styles.invoiceFooterCol}>
                <Text style={styles.invoiceFooterLabel}>الصافي</Text>
                <Text style={[styles.invoiceFooterValue, { color: '#00B86B', fontWeight: '900' }]}>
                  {formatCurrency(selectedInvoice.net_amount || selectedInvoice.total_amount)}
                </Text>
              </View>

              {selectedInvoice.discount_amount && selectedInvoice.discount_amount > 0 ? (
                <View style={styles.invoiceFooterCol}>
                  <Text style={[styles.invoiceFooterLabel, { color: '#EF4444' }]}>الخصم</Text>
                  <Text style={[styles.invoiceFooterValue, { color: '#EF4444' }]}>
                    {formatCurrency(selectedInvoice.discount_amount)}
                  </Text>
                </View>
              ) : null}

              {selectedInvoice.discount_amount && selectedInvoice.discount_amount > 0 ? (
                <View style={styles.invoiceFooterCol}>
                  <Text style={styles.invoiceFooterLabel}>قبل الخصم</Text>
                  <Text style={styles.invoiceFooterValue}>
                    {formatCurrency(
                      (selectedInvoice.net_amount || selectedInvoice.total_amount || 0) + selectedInvoice.discount_amount
                    )}
                  </Text>
                </View>
              ) : null}

              <View style={styles.invoiceFooterCol}>
                <Text style={styles.invoiceFooterLabel}>الأصناف</Text>
                <Text style={[styles.invoiceFooterValue, { color: colors.primary }]}>
                  {invoiceLines.length}
                </Text>
              </View>
            </View>
          </View>

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

          {/* Fixed Footer Summary for the Return */}
          <View style={styles.invoiceFooterBar}>
            <View style={styles.invoiceFooterRow}>
              <View style={styles.invoiceFooterCol}>
                <Text style={styles.invoiceFooterLabel}>صافي المرتجع</Text>
                <Text style={[styles.invoiceFooterValue, { color: '#F59E0B', fontWeight: '900' }]}>
                  {formatCurrency(selectedReturn.net_amount || selectedReturn.total_amount)}
                </Text>
              </View>

              <View style={styles.invoiceFooterCol}>
                <Text style={styles.invoiceFooterLabel}>الأصناف</Text>
                <Text style={[styles.invoiceFooterValue, { color: colors.primary }]}>
                  {returnLines.length}
                </Text>
              </View>
            </View>
          </View>

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
  // ----------------------------------------------------
  // MASTER PHARMACY CARD & DASHBOARD (كرت الصيدلية القيادي وإحصائيات الحساب)
  // ----------------------------------------------------
  const renderMasterPharmacyCard = () => {
    const activeItem = pharmacies[activePharmacyIndex] || {
      token: currentToken,
      pharmacy_code: currentPharmacyCode,
      pharmacy_name: currentPharmacyName,
      tenant_id: warehouse.id,
      is_suspended: false,
    };

    const hasDebt = (balance?.balance ?? 0) > 0;
    const hasCredit = (balance?.balance ?? 0) < 0;

    return (
      <View style={styles.masterCardWrapper}>
        {/* شريط التبديل السريع بين الفروع عند وجود أكثر من صيدلية */}
        {pharmacies.length > 1 && (
          <View style={styles.branchStripSection}>
            <View style={styles.branchStripHeader}>
              <Text style={[styles.branchStripTitle, { color: colors.secondaryText }]}>
                الفروع المسجلة ({pharmacies.length}):
              </Text>
              <TouchableOpacity
                onPress={handlePressAddPharmacy}
                style={styles.branchAddInlineBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
                <Text style={[styles.branchAddInlineText, { color: colors.primary }]}>
                  ربط فرع إضافي
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.branchPillsRow}
            >
              {pharmacies.map((item, idx) => {
                const isActive = idx === activePharmacyIndex;
                return (
                  <TouchableOpacity
                    key={`${item.pharmacy_code}_${idx}`}
                    style={[
                      styles.branchPill,
                      isActive
                        ? [styles.branchPillActive, { backgroundColor: colors.primary }]
                        : [styles.branchPillInactive, { borderColor: colors.border, backgroundColor: colors.card }],
                    ]}
                    onPress={() => switchPharmacy(idx)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={isActive ? 'checkmark-circle' : 'business-outline'}
                      size={14}
                      color={isActive ? '#FFFFFF' : colors.secondaryText}
                    />
                    <Text
                      style={[
                        styles.branchPillText,
                        isActive ? styles.branchPillTextActive : { color: colors.text },
                      ]}
                      numberOfLines={1}
                    >
                      {item.pharmacy_name || `فرع #${item.pharmacy_code}`}
                    </Text>
                    {item.is_suspended && (
                      <View style={styles.suspendedMiniDot} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* الكرت القيادي للصيدلية */}
        <View style={[styles.masterCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* رأس الكرت: اسم الصيدلية، الكود، وحالة الربط */}
          <View style={styles.masterCardHeader}>
            <View style={[styles.masterIconBox, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="business" size={24} color={colors.primary} />
            </View>

            <View style={styles.masterInfoCol}>
              <Text style={[styles.masterPharmacyName, { color: colors.text }]} numberOfLines={1}>
                {activeItem.pharmacy_name || `صيدلية #${activeItem.pharmacy_code}`}
              </Text>
              <View style={styles.masterCodeRow}>
                <View style={styles.codeTag}>
                  <Text style={styles.codeTagText}>كود الربط: #{activeItem.pharmacy_code}</Text>
                </View>
              </View>
            </View>

            <View>
              {activeItem.is_suspended ? (
                <View style={styles.statusPillSuspended}>
                  <Ionicons name="pause-circle" size={13} color="#DC2626" />
                  <Text style={styles.statusPillSuspendedText}>معلق مؤقتاً</Text>
                </View>
              ) : (
                <View style={styles.statusPillActive}>
                  <Ionicons name="checkmark-circle" size={13} color="#059669" />
                  <Text style={styles.statusPillActiveText}>نشط بالمخزن</Text>
                </View>
              )}
            </View>
          </View>

          {/* خط فاصل ناعم */}
          <View style={styles.masterDivider} />

          {/* لوحة المؤشرات المالية المدمجة */}
          <View style={styles.statsContainer}>
            <View style={styles.statsHeaderRow}>
              <Text style={[styles.statsHeaderTitle, { color: colors.secondaryText }]}>
                الموقف المالي الحالي مع المخزن
              </Text>
              <Text style={[styles.statsHeaderSub, { color: colors.secondaryText }]}>
                بالجنيه المصري
              </Text>
            </View>

            <View style={styles.statsMetricsRow}>
              {/* المؤشر الأول: الرصيد الحالي */}
              <View style={[styles.metricCard, styles.metricCardMain]}>
                <Text style={styles.metricLabel}>الرصيد المتبقي</Text>
                <Text
                  style={[
                    styles.metricValue,
                    hasDebt ? styles.metricValueDebt : hasCredit ? styles.metricValueCredit : { color: colors.text },
                  ]}
                  numberOfLines={1}
                >
                  {balance != null ? formatCurrency(balance.balance) : '—'}
                </Text>
                <Text style={styles.metricNote} numberOfLines={1}>
                  {hasDebt
                    ? '• مستحق للمخزن'
                    : hasCredit
                    ? '• رصيد دائن لصالحك'
                    : '• الحساب خالص'}
                </Text>
              </View>

              {/* المؤشر الثاني: إجمالي المشتريات */}
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>إجمالي المشتريات</Text>
                <Text style={[styles.metricValue, { color: colors.primary }]} numberOfLines={1}>
                  {balance?.total_purchases != null ? formatCurrency(balance.total_purchases) : '—'}
                </Text>
                <Text style={styles.metricNote}>مسحوبات</Text>
              </View>

              {/* المؤشر الثالث: إجمالي المسدد */}
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>إجمالي المسدد</Text>
                <Text style={[styles.metricValue, { color: '#059669' }]} numberOfLines={1}>
                  {balance?.total_paid != null ? formatCurrency(balance.total_paid) : '—'}
                </Text>
                <Text style={styles.metricNote}>نقدية ومقبوضات</Text>
              </View>
            </View>
          </View>

          {/* بطاقة تنبيه التعليق عند اختيار فرع معلق */}
          {activeItem.is_suspended && (
            <View style={styles.suspendedWarningCard}>
              <View style={styles.suspendedWarningTop}>
                <Ionicons name="pause-circle" size={20} color="#D97706" />
                <Text style={styles.suspendedWarningTitle}>هذا الفرع معلق مؤقتاً</Text>
              </View>
              <Text style={styles.suspendedWarningDesc}>
                تم تعليق هذا الفرع لتجاوز الحد الأقصى المسموح به في باقتك الحالية ({subscriptionStatusInfo?.allowedPharmacies || 1} صيدلية).
                بياناتك وفواتيرك محفوظة بالكامل ولم يُحذف أي منها.
              </Text>
              <View style={styles.suspendedWarningActions}>
                <TouchableOpacity
                  style={styles.suspendedUpgradeBtn}
                  onPress={() => setShowUpgradeModal(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flash" size={14} color="#1A0A33" />
                  <Text style={styles.suspendedUpgradeBtnText}>ترقية الباقة ⚡</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.suspendedSelectBtn}
                  onPress={() => setShowSelectActiveModal(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.suspendedSelectBtnText}>اختيار الفروع النشطة</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  };

  // ----------------------------------------------------
  // MAIN PORTAL SCREEN (شاشة المخزن الرئيسية المنظمة)
  // ----------------------------------------------------
  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} translucent={false} />

      {/* Top Header: زر الرجوع، اسم المخزن، وزر التحديث */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backBtnClean}
          onPress={onBack}
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.topHeaderTitleBox}>
          <Text style={[styles.topHeaderTitle, { color: colors.text }]} numberOfLines={1}>
            {warehouse.name || 'المخزن'}
          </Text>
          <View style={styles.warehouseStatusRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.warehouseSubtitle}>بوابة المورد • ربط مباشر</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.headerRefreshBtn}
          onPress={onRefresh}
          activeOpacity={0.6}
        >
          <Ionicons name="sync-outline" size={20} color={colors.secondaryText} />
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
        {/* كرت الصيدلية القيادي وإحصائيات الحساب وشريط الفروع */}
        {renderMasterPharmacyCard()}

        {/* عنوان قسم العمليات والسجلات */}
        <View style={styles.sectionHeaderRow}>
          <View style={styles.sectionHeaderRight}>
            <Ionicons name="layers-outline" size={17} color={colors.primary} />
            <Text style={[styles.sectionHeadingText, { color: colors.text }]}>
              سجلات وحركات المخزن
            </Text>
          </View>
          <Text style={[styles.sectionHeaderSub, { color: colors.secondaryText }]}>
            اضغط لعرض التفاصيل
          </Text>
        </View>

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

              {/* بادج العدد وسهم الانتقال يسار الكرت */}
              <View style={styles.navLeftCol}>
                {sec.count != null && sec.count > 0 && (
                  <View style={[styles.navCountBadge, { backgroundColor: sec.bgColor }]}>
                    <Text style={[styles.navCountBadgeText, { color: sec.color }]}>
                      {sec.count} {sec.key === 'purchases' ? 'فاتورة' : sec.key === 'returns' ? 'مرتجع' : sec.key === 'receipts' ? 'سند' : 'حركة'}
                    </Text>
                  </View>
                )}
                <Ionicons name="chevron-back" size={18} color={colors.secondaryText} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* كرت إضافة صيدلية أخرى أسفل الصفحة - تصميم راقي واحترافي */}
        <TouchableOpacity
          style={[
            styles.addPharmacyCard,
            { backgroundColor: colors.card, borderColor: '#D8C7F2' },
          ]}
          onPress={handlePressAddPharmacy}
          activeOpacity={0.82}
        >
          <View style={[styles.addPharmacyIconCircle, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="business" size={22} color={colors.primary} />
            <View style={styles.addPlusBadge}>
              <Ionicons name="add" size={11} color="#FFFFFF" />
            </View>
          </View>

          <View style={styles.addPharmacyInfoCol}>
            <Text style={[styles.addPharmacyTitle, { color: colors.text }]}>
              ربط صيدلية أو فرع إضافي
            </Text>
            <Text style={[styles.addPharmacySubtitle, { color: colors.secondaryText }]}>
              أدخل كود صيدلية أخرى لنفس المخزن للتبديل السريع بين فروعك
            </Text>
          </View>

          <View style={[styles.addPharmacyBtnPill, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={14} color="#FFFFFF" />
            <Text style={styles.addPharmacyBtnText}>ربط فرع</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* مودال تنبيه فك الارتباط من الأسفل (Bottom Sheet) */}
      <UnlinkedNoticeModal
        visible={unlinkNoticeVisible}
        warehouseName={warehouse.name}
        pharmacyName={unlinkNoticeConfig.pharmacyName || currentPharmacyName}
        message={unlinkNoticeConfig.message}
        isSwitchBranch={unlinkNoticeConfig.isSwitchBranch}
        switchedToName={unlinkNoticeConfig.switchedToName}
        onClose={() => {
          setUnlinkNoticeVisible(false);
          if (!unlinkNoticeConfig.isSwitchBranch) {
            onBack();
          }
        }}
      />

      {/* نافذة التحقق وإضافة صيدلية أخرى لنفس المخزن */}
      <PharmacyVerifyModal
        visible={showAddModal}
        warehouse={warehouse}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />

      {/* نافذة ترقية الاشتراك التناسبية واحتساب الرصيد الدائن لبدء شهر جديد */}
      <UpgradeProrationModal
        visible={showUpgradeModal}
        warehouseName={warehouse.name}
        currentPharmacyCount={pharmacies.length}
        targetPlan={subscriptionRequiredPlan}
        onClose={() => setShowUpgradeModal(false)}
        onUpgradeSuccess={async () => {
          setShowUpgradeModal(false);
          setShowAddModal(true);
        }}
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

      {/* نافذة تحديد وتفعيل الصيدليات النشطة */}
      <SelectActivePharmaciesModal
        visible={showSelectActiveModal}
        onClose={() => setShowSelectActiveModal(false)}
        userEmail={user?.email || ''}
        allowedPharmacies={subscriptionStatusInfo?.allowedPharmacies || 1}
        pharmacies={subscriptionStatusInfo?.uniquePharmacies || []}
        onSuccess={async () => {
          setShowSelectActiveModal(false);
          await checkAndSyncPharmacies();
          await loadData(currentToken, false);
          Alert.alert('تم بنجاح', 'تم تحديث الصيدليات النشطة بنجاح.');
        }}
        onUpgradePress={() => {
          setShowSelectActiveModal(false);
          setShowUpgradeModal(true);
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
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderTitleBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  warehouseStatusRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  warehouseSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7B6F93',
  },
  headerRefreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderSpacer: {
    width: 40,
  },
  scrollArea: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 36,
    gap: 14,
  },
  subPageScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
    gap: 10,
  },

  // كرت الصيدلية القيادي وشريط الفروع
  masterCardWrapper: {
    gap: 10,
    marginTop: 2,
    marginBottom: 2,
  },
  branchStripSection: {
    gap: 8,
  },
  branchStripHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  branchStripTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  branchAddInlineBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  branchAddInlineText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  branchPillsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  branchPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
  },
  branchPillActive: {
    borderWidth: 0,
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  branchPillInactive: {
    elevation: 1,
  },
  branchPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  branchPillTextActive: {
    color: '#FFFFFF',
  },
  suspendedMiniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DC2626',
  },

  // الكرت القيادي للصيدلية
  masterCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  masterCardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  masterIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterInfoCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 4,
  },
  masterPharmacyName: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
  },
  masterCodeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  codeTag: {
    backgroundColor: '#F3EEFA',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  codeTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3f0082',
  },
  statusPillActive: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillActiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  statusPillSuspended: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillSuspendedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  masterDivider: {
    height: 1,
    backgroundColor: '#F3EEF9',
    marginVertical: 14,
  },
  statsContainer: {
    gap: 10,
  },
  statsHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  statsHeaderSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  statsMetricsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FAF7FD',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: '#F0E8F8',
  },
  metricCardMain: {
    backgroundColor: '#F5EEFC',
    borderColor: '#E6D7F8',
  },
  metricLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#6B5E87',
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 2,
  },
  metricValueDebt: {
    color: '#DC2626',
  },
  metricValueCredit: {
    color: '#059669',
  },
  metricNote: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#8A7A9E',
    textAlign: 'center',
    marginTop: 1,
  },

  // شاشة اللوجو الكاملة
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
  sectionHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  sectionHeaderRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  sectionHeadingText: {
    fontSize: 15,
    fontWeight: '800',
  },
  sectionHeaderSub: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  cardsListContainer: {
    gap: 10,
  },
  sectionNavCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1.5,
    gap: 12,
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
    gap: 2,
  },
  navTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  navDesc: {
    fontSize: 11.5,
    fontWeight: '500',
    textAlign: 'right',
  },
  navLeftCol: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  navCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  navCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // كرت إضافة صيدلية أخرى أسفل الصفحة
  addPharmacyCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 8,
    gap: 12,
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  addPharmacyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  addPlusBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#3f0082',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  addPharmacyInfoCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  addPharmacyTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  addPharmacySubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    textAlign: 'right',
    lineHeight: 16,
  },
  addPharmacyBtnPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  addPharmacyBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
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

  // Bottom Summary Bar Styles
  invoiceFooterBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 8,
  },
  invoiceFooterRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  invoiceFooterCol: {
    alignItems: 'center',
    gap: 3,
  },
  invoiceFooterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  invoiceFooterValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
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
  suspendedWarningCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  suspendedWarningTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  suspendedWarningTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
    textAlign: 'right',
  },
  suspendedWarningDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: '#B45309',
    textAlign: 'right',
    marginBottom: 10,
  },
  suspendedWarningActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  suspendedUpgradeBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FBBF24',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  suspendedUpgradeBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A0A33',
  },
  suspendedSelectBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  suspendedSelectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
});
