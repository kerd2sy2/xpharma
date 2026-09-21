import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/context/AuthContext';
import ModuleErrorBoundary from '@/components/ModuleErrorBoundary';
import PharmacyVerifyModal from '@/components/PharmacyVerifyModal';
import SubscriptionModal from '@/components/SubscriptionModal';
import UpgradeProrationModal from '@/components/UpgradeProrationModal';
import UnlinkedNoticeModal from '@/components/UnlinkedNoticeModal';
import SelectActivePharmaciesModal from '@/components/SelectActivePharmaciesModal';
import XLogo from '@/components/XLogo';

// Services & Types
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
  checkCanAddPharmacyInWarehouse,
  getSubscriptionStatus,
  registerGlobalPharmacy,
  SubscriptionStatus,
} from '@/services/subscription';

// Modular Portal Components
import PortalHeader from '@/features/portal/components/PortalHeader';
import PharmacyMasterCard from '@/features/portal/components/PharmacyMasterCard';
import PortalSectionCards from '@/features/portal/components/PortalSectionCards';
import AddPharmacyCard from '@/features/portal/components/AddPharmacyCard';
import InvoiceDetailsView from '@/features/portal/components/InvoiceDetailsView';
import ReturnDetailsView from '@/features/portal/components/ReturnDetailsView';
import PortalSectionListView from '@/features/portal/components/PortalSectionListView';
import InvoiceInfoModal from '@/features/portal/components/InvoiceInfoModal';
import ReturnInfoModal from '@/features/portal/components/ReturnInfoModal';
import {
  defaultPortalColors,
  PortalSectionConfig,
  SectionKey,
} from '@/features/portal/types';

interface WarehousePortalScreenProps {
  warehouse: Warehouse;
  token: string;
  pharmacyCode: string;
  pharmacyName: string;
  onBack: () => void;
}

export default function WarehousePortalScreen({
  warehouse,
  token,
  pharmacyCode,
  pharmacyName,
  onBack,
}: WarehousePortalScreenProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, 24);
  const { user } = useAuth();
  const colors = defaultPortalColors;

  // Navigation & Sub-Screen State
  const [selectedSection, setSelectedSection] = useState<SectionKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Multi-pharmacy state
  const [activePharmacyIndex, setActivePharmacyIndex] = useState(0);
  const [currentToken, setCurrentToken] = useState(token);
  const [currentPharmacyCode, setCurrentPharmacyCode] = useState(pharmacyCode);
  const [currentPharmacyName, setCurrentPharmacyName] = useState(pharmacyName);
  const [pharmacies, setPharmacies] = useState<LinkedPharmacyAccount[]>([]);
  const pharmaciesRef = useRef(pharmacies);
  pharmaciesRef.current = pharmacies;
  const activeIndexRef = useRef(activePharmacyIndex);
  activeIndexRef.current = activePharmacyIndex;

  // Modals & Subscription State
  const [showAddModal, setShowAddModal] = useState(false);
  const [unlinkNoticeVisible, setUnlinkNoticeVisible] = useState(false);
  const [unlinkNoticeConfig, setUnlinkNoticeConfig] = useState<{
    message?: string;
    isSwitchBranch?: boolean;
    pharmacyName?: string;
    switchedToName?: string;
  }>({});
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [subscriptionReason, setSubscriptionReason] = useState<string | undefined>();
  const [subscriptionRequiredPlan, setSubscriptionRequiredPlan] = useState<number>(2);
  const [isTrialExpired, setIsTrialExpired] = useState(false);
  const [showSelectActiveModal, setShowSelectActiveModal] = useState(false);
  const [subscriptionStatusInfo, setSubscriptionStatusInfo] = useState<SubscriptionStatus | null>(null);

  // Financial & Data State
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

  // Pagination states
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const offsetsRef = useRef({ purchases: 0, returns: 0, receipts: 0, statement: 0 });
  const [hasMoreInvoices, setHasMoreInvoices] = useState(true);
  const [hasMoreReturns, setHasMoreReturns] = useState(true);
  const [hasMoreReceipts, setHasMoreReceipts] = useState(true);
  const [hasMoreStatement, setHasMoreStatement] = useState(true);

  // Hardware Android Back button handling
  useEffect(() => {
    const onBackPress = () => {
      if (unlinkNoticeVisible) {
        setUnlinkNoticeVisible(false);
        if (!unlinkNoticeConfig.isSwitchBranch) onBack();
        return true;
      }
      if (showInvoiceInfoModal) {
        setShowInvoiceInfoModal(false);
        return true;
      }
      if (showReturnInfoModal) {
        setShowReturnInfoModal(false);
        return true;
      }
      if (showUpgradeModal) {
        setShowUpgradeModal(false);
        return true;
      }
      if (showSubscriptionModal && !isTrialExpired) {
        setShowSubscriptionModal(false);
        return true;
      }
      if (showAddModal) {
        setShowAddModal(false);
        return true;
      }
      if (selectedInvoice) {
        setSelectedInvoice(null);
        setInvoiceLines([]);
        return true;
      }
      if (selectedReturn) {
        setSelectedReturn(null);
        setReturnLines([]);
        return true;
      }
      if (selectedSection) {
        setSelectedSection(null);
        return true;
      }
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

  // Initialize saved pharmacies
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
        setPharmacies(saved.length > 0 ? saved : [initialAccount]);
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
        await clearPharmacySession(warehouse.id);
        setUnlinkNoticeConfig({
          message: 'تم إلغاء ربط صيدليتك في هذا المخزن من قبل إدارة المنصة.',
          isSwitchBranch: false,
          pharmacyName: currentPharmacyName,
        });
        setUnlinkNoticeVisible(true);
        return;
      }

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

      const isCurrentStillLinked = serverAccounts.some(
        (a) => a.pharmacy_code === currentPharmacyCode
      );

      if (!isCurrentStillLinked) {
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

        if (!nextBatch || nextBatch.length < 20) setHasMoreInvoices(false);
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

        if (!nextBatch || nextBatch.length < 20) setHasMoreReturns(false);
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

        if (!nextBatch || nextBatch.length < 20) setHasMoreReceipts(false);
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

        if (!nextBatch || nextBatch.length < 20) setHasMoreStatement(false);
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

  const handleInvoicePress = async (inv: InvoiceItem) => {
    setSelectedInvoice(inv);
    const targetId = inv.id || inv.remote_id || inv.invoice_number;

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
        const fallbackItems: InvoiceLineItem[] = [
          {
            id: 'fallback-ret-1',
            item_name: 'أدوية ومستلزمات عامة (مرتجع مسجل)',
            quantity: 1,
            unit_price: ret.total_amount || ret.net_amount || 0,
            discount_percent: 0,
            total_price: ret.net_amount || ret.total_amount || 0,
          },
        ];
        returnLinesCacheRef.current[targetId] = fallbackItems;
        setReturnLines(fallbackItems);
      }
    } catch (e) {
      console.error('Error fetching return lines:', e);
    } finally {
      setLoadingReturnLines(false);
    }
  };

  // Section configuration
  const sections: PortalSectionConfig[] = [
    {
      key: 'purchases',
      title: 'المشتريات',
      desc: 'سجل فواتير المشتريات المستلمة',
      amount: balance?.total_purchases,
      count: invoices.length,
      icon: 'cart-outline',
      color: colors.primary,
      bgColor: colors.primarySoft,
    },
    {
      key: 'returns',
      title: 'المرتجعات',
      desc: 'سجل فواتير المرتجع للمخزن',
      amount: balance?.total_returns,
      count: returns.length,
      icon: 'arrow-undo-outline',
      color: colors.warning,
      bgColor: colors.warningSoft,
    },
    {
      key: 'receipts',
      title: 'النقدية',
      desc: 'سجل المقبوضات والدفعات المالية',
      amount: balance?.total_paid,
      count: receipts.length,
      icon: 'cash-outline',
      color: colors.success,
      bgColor: colors.successSoft,
    },
    {
      key: 'statement',
      title: 'كشف حساب',
      desc: 'حركات الحساب التفصيلية والرصيد',
      count: statement.length,
      icon: 'receipt-outline',
      color: colors.indigo,
      bgColor: colors.indigoSoft,
    },
  ];

  // Active Pharmacy Item
  const activeItem = pharmacies[activePharmacyIndex] || {
    token: currentToken,
    pharmacy_code: currentPharmacyCode,
    pharmacy_name: currentPharmacyName,
    tenant_id: warehouse.id,
    is_suspended: false,
  };

  // 1. SUB-SCREEN: INVOICE DETAILS VIEW
  if (selectedSection === 'purchases' && selectedInvoice) {
    return (
      <ModuleErrorBoundary
        fallbackTitle="تعذر عرض تفاصيل الفاتورة"
        fallbackMessage="حدث خطأ أثناء قراءة أصناف الفاتورة. تم عزل المشكلة ويمكنك العودة للقائمة بأمان."
        onRetry={onRefresh}
      >
        <InvoiceDetailsView
          invoice={selectedInvoice}
          lines={invoiceLines}
          loading={loadingInvoiceLines}
          onBack={() => {
            setSelectedInvoice(null);
            setInvoiceLines([]);
          }}
          onShowInfo={() => setShowInvoiceInfoModal(true)}
          topInset={topInset}
          colors={colors}
        />
        <InvoiceInfoModal
          visible={showInvoiceInfoModal}
          invoice={selectedInvoice}
          itemCount={invoiceLines.length}
          onClose={() => setShowInvoiceInfoModal(false)}
          colors={colors}
        />
      </ModuleErrorBoundary>
    );
  }

  // 2. SUB-SCREEN: RETURN DETAILS VIEW
  if (selectedSection === 'returns' && selectedReturn) {
    return (
      <ModuleErrorBoundary
        fallbackTitle="تعذر عرض تفاصيل المرتجع"
        fallbackMessage="حدث خطأ أثناء قراءة أصناف المرتجع. تم عزل المشكلة ويمكنك العودة للقائمة بأمان."
        onRetry={onRefresh}
      >
        <ReturnDetailsView
          returnItem={selectedReturn}
          lines={returnLines}
          loading={loadingReturnLines}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onBack={() => {
            setSelectedReturn(null);
            setReturnLines([]);
          }}
          onShowInfo={() => setShowReturnInfoModal(true)}
          topInset={topInset}
          colors={colors}
        />
        <ReturnInfoModal
          visible={showReturnInfoModal}
          returnItem={selectedReturn}
          itemCount={returnLines.length}
          onClose={() => setShowReturnInfoModal(false)}
          colors={colors}
        />
      </ModuleErrorBoundary>
    );
  }

  // 3. SUB-SCREEN: SECTION LIST VIEW
  if (selectedSection) {
    const currentSec = sections.find((s) => s.key === selectedSection);
    const getSectionData = () => {
      if (selectedSection === 'purchases') return invoices;
      if (selectedSection === 'returns') return returns;
      if (selectedSection === 'receipts') return receipts;
      if (selectedSection === 'statement') return statement;
      return [];
    };

    const hasMoreForCurrent =
      selectedSection === 'purchases'
        ? hasMoreInvoices
        : selectedSection === 'returns'
        ? hasMoreReturns
        : selectedSection === 'receipts'
        ? hasMoreReceipts
        : hasMoreStatement;

    return (
      <ModuleErrorBoundary
        fallbackTitle="تعذر عرض قائمة السجلات"
        fallbackMessage="حدث خطأ في تحميل سجلات هذا القسم. اضغط إعادة المحاولة للإنعاش."
        onRetry={onRefresh}
      >
        <PortalSectionListView
          sectionKey={selectedSection}
          sectionTitle={currentSec?.title || 'السجلات'}
          data={getSectionData()}
          loadingMore={loadingMore}
          hasMore={hasMoreForCurrent}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onLoadMore={loadMoreData}
          onBack={() => setSelectedSection(null)}
          onInvoicePress={handleInvoicePress}
          onReturnPress={handleReturnPress}
          topInset={topInset}
          colors={colors}
        />
      </ModuleErrorBoundary>
    );
  }

  // 4. MAIN PORTAL DASHBOARD (Orchestrated Modular Screen)
  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} translucent={false} />

      {/* Modular Header */}
      <PortalHeader
        title={warehouse.name || 'المخزن'}
        onBack={onBack}
        onRefresh={onRefresh}
        colors={colors}
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.mainScrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
      >
        {/* Modular Master Pharmacy Card with Error Boundary */}
        <ModuleErrorBoundary
          fallbackTitle="تعذر عرض كرت الصيدلية"
          fallbackMessage="حدث خطأ في حساب الرصيد أو الفروع. يمكنك متابعة العمليات أدناه."
          onRetry={onRefresh}
        >
          <PharmacyMasterCard
            pharmacies={pharmacies}
            activePharmacyIndex={activePharmacyIndex}
            activeItem={activeItem}
            balance={balance}
            onSwitchPharmacy={switchPharmacy}
            onPressAddPharmacy={handlePressAddPharmacy}
            onPressUpgrade={() => setShowUpgradeModal(true)}
            onPressSelectActive={() => setShowSelectActiveModal(true)}
            allowedPharmacies={subscriptionStatusInfo?.allowedPharmacies || 1}
            colors={colors}
          />
        </ModuleErrorBoundary>

        {/* Modular Operations Navigation Cards with Error Boundary */}
        <ModuleErrorBoundary
          fallbackTitle="تعذر عرض أقسام العمليات"
          fallbackMessage="حدث خطأ أثناء عرض بطاقات الأقسام."
          onRetry={onRefresh}
        >
          <PortalSectionCards
            sections={sections}
            onSelectSection={setSelectedSection}
            colors={colors}
          />
        </ModuleErrorBoundary>

        {/* Modular Add Pharmacy Card with Error Boundary */}
        <ModuleErrorBoundary
          fallbackTitle="تعذر عرض خيار إضافة فرع"
          fallbackMessage="حدث خطأ في تجهيز كرت الإضافة."
        >
          <AddPharmacyCard
            onPress={handlePressAddPharmacy}
            colors={colors}
          />
        </ModuleErrorBoundary>
      </ScrollView>

      {/* Dialogs & Modals */}
      <UnlinkedNoticeModal
        visible={unlinkNoticeVisible}
        warehouseName={warehouse.name}
        pharmacyName={unlinkNoticeConfig.pharmacyName || currentPharmacyName}
        message={unlinkNoticeConfig.message}
        isSwitchBranch={unlinkNoticeConfig.isSwitchBranch}
        switchedToName={unlinkNoticeConfig.switchedToName}
        onClose={() => {
          setUnlinkNoticeVisible(false);
          if (!unlinkNoticeConfig.isSwitchBranch) onBack();
        }}
      />

      <PharmacyVerifyModal
        visible={showAddModal}
        warehouse={warehouse}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />

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

      <SubscriptionModal
        visible={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        reason={subscriptionReason}
        isTrialExpired={isTrialExpired}
        suggestedPlan={subscriptionRequiredPlan}
        onSubscribed={() => {
          setShowSubscriptionModal(false);
          setIsTrialExpired(false);
        }}
      />

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

      {/* Fullscreen Initial Loader */}
      {loading && (
        <View style={[styles.fullScreenLogoOverlay, { top: -topInset, bottom: -insets.bottom }]}>
          <View style={styles.fullScreenLogoSection}>
            <XLogo
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
  scrollArea: {
    flex: 1,
  },
  mainScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 36,
    gap: 14,
  },
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
});
