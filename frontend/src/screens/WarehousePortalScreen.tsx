import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import PharmacyVerifyModal from '@/components/PharmacyVerifyModal';
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
  const [selectedSection, setSelectedSection] = useState<SectionKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Multi-pharmacy state
  const [currentToken, setCurrentToken] = useState(token);
  const [currentPharmacyCode, setCurrentPharmacyCode] = useState(pharmacyCode);
  const [currentPharmacyName, setCurrentPharmacyName] = useState(pharmacyName);
  const [pharmacies, setPharmacies] = useState<LinkedPharmacyAccount[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  const [balance, setBalance] = useState<PharmacyBalance | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [statement, setStatement] = useState<StatementItem[]>([]);

  const colors = {
    bg: '#F9F7FD',
    card: '#FFFFFF',
    text: '#1A0A33',
    secondaryText: '#7B6F93',
    border: '#EDE7F6',
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
        setPharmacies(saved.length > 0 ? saved : [initialAccount]);
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

      setBalance(bal);
      setInvoices(invs);
      setReturns(rets);
      setReceipts(recs);
      setStatement(stmts);
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

  // Switch active pharmacy
  const handleSelectPharmacy = (ph: LinkedPharmacyAccount) => {
    if (ph.token === currentToken) return;
    setCurrentToken(ph.token);
    setCurrentPharmacyCode(ph.pharmacy_code);
    setCurrentPharmacyName(ph.pharmacy_name);
  };

  // When a new pharmacy is verified and added
  const handleAddSuccess = async (result: VerifyPharmacyResult) => {
    if (!result.token) return;
    const newAccount: LinkedPharmacyAccount = {
      token: result.token,
      pharmacy_code: result.pharmacy_code || '',
      pharmacy_name: result.pharmacy_name || 'الصيدلية',
      tenant_id: warehouse.id,
    };
    const updatedList = await saveWarehousePharmacy(warehouse.id, newAccount);
    setPharmacies(updatedList);
    setCurrentToken(newAccount.token);
    setCurrentPharmacyCode(newAccount.pharmacy_code);
    setCurrentPharmacyName(newAccount.pharmacy_name);
    setShowAddModal(false);
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

      {/* شريط تبديل الصيدليات (يظهر عند وجود أكثر من صيدلية مربوطة لنفس المخزن) */}
      {pharmacies.length > 1 && (
        <View style={styles.pharmacySwitcherWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pharmacySwitcherScroll}
          >
            {pharmacies.map((ph) => {
              const isSelected = ph.token === currentToken;
              return (
                <TouchableOpacity
                  key={ph.pharmacy_code || ph.token}
                  style={[
                    styles.pharmacyChip,
                    isSelected
                      ? [styles.pharmacyChipActive, { backgroundColor: colors.primary }]
                      : [styles.pharmacyChipInactive, { backgroundColor: colors.card, borderColor: colors.border }],
                  ]}
                  onPress={() => handleSelectPharmacy(ph)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="medkit"
                    size={14}
                    color={isSelected ? '#FFFFFF' : colors.primary}
                  />
                  <Text
                    style={[
                      styles.pharmacyChipText,
                      { color: isSelected ? '#FFFFFF' : colors.text },
                    ]}
                  >
                    {ph.pharmacy_name || `صيدلية #${ph.pharmacy_code}`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.secondaryText }]}>
            جاري تحميل الحساب...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.mainScrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {/* كرت اسم الصيدلية والرصيد الحالي */}
          <View style={[styles.cleanBalanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.cleanPharmacyName, { color: colors.text }]} numberOfLines={1}>
              {currentPharmacyName || 'الصيدلية'}
            </Text>
            <View style={styles.cleanBalanceBox}>
              <Text style={[styles.cleanBalanceLabel, { color: colors.secondaryText }]}>
                الرصيد الحالي
              </Text>
              <Text style={[styles.cleanBalanceValue, { color: colors.primary }]}>
                {formatCurrency(balance?.balance)}
              </Text>
            </View>
          </View>

          {/* كروت الأقسام الأربعة - نقرة تنقل لصفحة منفصلة */}
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
      )}

      {/* نافذة التحقق وإضافة صيدلية أخرى لنفس المخزن */}
      <PharmacyVerifyModal
        visible={showAddModal}
        warehouse={warehouse}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddSuccess}
      />
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
  pharmacySwitcherWrap: {
    paddingVertical: 4,
    marginBottom: 4,
  },
  pharmacySwitcherScroll: {
    flexDirection: 'row-reverse',
    paddingHorizontal: 16,
    gap: 8,
  },
  pharmacyChip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  pharmacyChipActive: {
    borderColor: 'transparent',
  },
  pharmacyChipInactive: {},
  pharmacyChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
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

  // كرت الرصيد المبسط النظيف
  cleanBalanceCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    gap: 12,
  },
  cleanPharmacyName: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'right',
  },
  cleanBalanceBox: {
    alignItems: 'flex-end',
    gap: 2,
  },
  cleanBalanceLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  cleanBalanceValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
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
