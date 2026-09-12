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
import {
  fetchPharmacyBalance,
  fetchPharmacyPurchases,
  fetchPharmacyReceipts,
  fetchPharmacyReturns,
  fetchPharmacyStatement,
  InvoiceItem,
  PharmacyBalance,
  ReceiptItem,
  ReturnItem,
  StatementItem,
  Warehouse,
} from '@/services/warehouse';

interface WarehousePortalScreenProps {
  warehouse: Warehouse;
  token: string;
  pharmacyCode: string;
  pharmacyName: string;
  onBack: () => void;
}

type TabKey = 'purchases' | 'returns' | 'receipts' | 'statement';

export default function WarehousePortalScreen({
  warehouse,
  token,
  pharmacyCode,
  pharmacyName,
  onBack,
}: WarehousePortalScreenProps) {
  const isDark = false;

  const [activeTab, setActiveTab] = useState<TabKey>('purchases');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [balance, setBalance] = useState<PharmacyBalance | null>(null);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [returns, setReturns] = useState<ReturnItem[]>([]);
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [statement, setStatement] = useState<StatementItem[]>([]);

  const colors = {
    bg: '#F9F7FD',
    card: '#FFFFFF',
    text: '#1A0A33',
    secondaryText: '#6B5E82',
    border: '#E9E3F3',
    primary: '#3f0082',
    primarySoft: '#3f008215',
    success: '#00d780',
    successSoft: '#00d78018',
    warning: '#F59E0B',
    danger: '#EF4444',
  };

  const loadData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const [bal, invs, rets, recs, stmts] = await Promise.all([
        fetchPharmacyBalance(token),
        fetchPharmacyPurchases(token),
        fetchPharmacyReturns(token),
        fetchPharmacyReceipts(token),
        fetchPharmacyStatement(token),
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
    loadData(true);
  }, [token]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData(false);
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
  const topInset = Math.max(insets.top, 28);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset }]}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={colors.bg}
        translucent={false}
      />

      {/* Top Header: Simple back arrow */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backBtnClean}
          onPress={onBack}
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topHeaderTitle, { color: colors.text }]}>حساب الصيدلية بالمخزن</Text>
        <View style={styles.topHeaderSpacer} />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.secondaryText }]}>
            بنحمل بيانات وحسابات صيدليتك من سيستم المخزن...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {/* أولاً: كرت اسم المخزن */}
          <View style={[styles.mainCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.warehouseCardRow}>
              <View style={[styles.warehouseIconCircle, { backgroundColor: colors.primarySoft }]}>
                <Ionicons name="business" size={26} color={colors.primary} />
              </View>
              <View style={styles.warehouseInfoCol}>
                <View style={styles.onlineBadgeRow}>
                  <View style={styles.onlineDot} />
                  <Text style={styles.onlineBadgeText}>مخزن أدوية متصل أونلاين</Text>
                </View>
                <Text style={[styles.warehouseNameTitle, { color: colors.text }]}>
                  {warehouse.name}
                </Text>
              </View>
            </View>
          </View>

          {/* ثانياً: كرت اسم الصيدلية والرصيد الحالي */}
          <View style={[styles.mainCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Pharmacy Identity Row */}
            <View style={styles.pharmacyIdentityRow}>
              <View style={styles.pharmacyTitleCol}>
                <Text style={[styles.pharmacySubHead, { color: colors.secondaryText }]}>الصيدلية المربوطة</Text>
                <Text style={[styles.pharmacyNameLarge, { color: colors.text }]} numberOfLines={1}>
                  {pharmacyName || 'الصيدلية'}
                </Text>
                <Text style={[styles.pharmacyCodePill, { color: colors.primary }]}>
                  كود الصيدلية بالمخزن: #{pharmacyCode}
                </Text>
              </View>
              <View style={[styles.linkedBadge, { backgroundColor: colors.successSoft }]}>
                <Ionicons name="shield-checkmark" size={15} color={colors.success} />
                <Text style={[styles.linkedBadgeText, { color: colors.success }]}>مربوطة</Text>
              </View>
            </View>

            <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

            {/* Current Balance Row */}
            <View style={styles.balanceSection}>
              <View style={styles.balanceInfoCol}>
                <Text style={[styles.balanceSubLabel, { color: colors.secondaryText }]}>
                  الرصيد الحالي المطلوب منك للمخزن
                </Text>
                <Text style={[styles.balanceAmountLarge, { color: colors.primary }]}>
                  {formatCurrency(balance?.balance)}
                </Text>
              </View>
              <View style={[styles.balanceStatusTag, { backgroundColor: colors.successSoft }]}>
                <Ionicons name="checkmark-circle" size={15} color={colors.success} />
                <Text style={[styles.balanceStatusText, { color: colors.success }]}>حسابك مضبوط</Text>
              </View>
            </View>
          </View>

          {/* ثالثاً: كروت الأقسام الأربعة */}
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionTitleLabel, { color: colors.text }]}>
              أقسام الحساب والفواتير
            </Text>
            <Text style={[styles.sectionSubtitleLabel, { color: colors.secondaryText }]}>
              اضغط على أي كرت لعرض تفاصيله
            </Text>
          </View>

          <View style={styles.gridContainer}>
            {/* 1. كرت المشتريات */}
            <TouchableOpacity
              style={[
                styles.gridCard,
                { backgroundColor: colors.card, borderColor: activeTab === 'purchases' ? colors.primary : colors.border },
                activeTab === 'purchases' && { backgroundColor: colors.primarySoft, borderWidth: 2 },
              ]}
              onPress={() => setActiveTab('purchases')}
              activeOpacity={0.8}
            >
              <View style={styles.gridCardHeader}>
                <View style={[styles.gridIconWrap, { backgroundColor: activeTab === 'purchases' ? colors.primary : colors.primarySoft }]}>
                  <Ionicons name="cart" size={20} color={activeTab === 'purchases' ? '#FFFFFF' : colors.primary} />
                </View>
                <View style={[styles.countPill, { backgroundColor: activeTab === 'purchases' ? colors.primary : '#E9E3F3' }]}>
                  <Text style={[styles.countPillText, { color: activeTab === 'purchases' ? '#FFFFFF' : colors.primary }]}>
                    {invoices.length}
                  </Text>
                </View>
              </View>
              <Text style={[styles.gridCardTitle, { color: colors.text }]}>1. المشتريات</Text>
              <Text style={[styles.gridCardDesc, { color: colors.secondaryText }]}>
                فواتير الصيدلي اللي أخدها من المخزن
              </Text>
              <Text style={[styles.gridCardAmount, { color: colors.primary }]}>
                {formatCurrency(balance?.total_purchases)}
              </Text>
            </TouchableOpacity>

            {/* 2. كرت المرتجعات */}
            <TouchableOpacity
              style={[
                styles.gridCard,
                { backgroundColor: colors.card, borderColor: activeTab === 'returns' ? colors.warning : colors.border },
                activeTab === 'returns' && { backgroundColor: '#FEF3C755', borderWidth: 2 },
              ]}
              onPress={() => setActiveTab('returns')}
              activeOpacity={0.8}
            >
              <View style={styles.gridCardHeader}>
                <View style={[styles.gridIconWrap, { backgroundColor: activeTab === 'returns' ? colors.warning : '#FEF3C7' }]}>
                  <Ionicons name="arrow-undo" size={20} color={activeTab === 'returns' ? '#FFFFFF' : '#B45309'} />
                </View>
                <View style={[styles.countPill, { backgroundColor: activeTab === 'returns' ? '#B45309' : '#FEF3C7' }]}>
                  <Text style={[styles.countPillText, { color: activeTab === 'returns' ? '#FFFFFF' : '#B45309' }]}>
                    {returns.length}
                  </Text>
                </View>
              </View>
              <Text style={[styles.gridCardTitle, { color: colors.text }]}>2. المرتجعات</Text>
              <Text style={[styles.gridCardDesc, { color: colors.secondaryText }]}>
                الفواتير أو الأصناف اللي رجعها للمخزن
              </Text>
              <Text style={[styles.gridCardAmount, { color: '#B45309' }]}>
                {formatCurrency(balance?.total_returns)}
              </Text>
            </TouchableOpacity>

            {/* 3. كرت النقدية */}
            <TouchableOpacity
              style={[
                styles.gridCard,
                { backgroundColor: colors.card, borderColor: activeTab === 'receipts' ? colors.success : colors.border },
                activeTab === 'receipts' && { backgroundColor: colors.successSoft, borderWidth: 2 },
              ]}
              onPress={() => setActiveTab('receipts')}
              activeOpacity={0.8}
            >
              <View style={styles.gridCardHeader}>
                <View style={[styles.gridIconWrap, { backgroundColor: activeTab === 'receipts' ? colors.success : colors.successSoft }]}>
                  <Ionicons name="wallet" size={20} color={activeTab === 'receipts' ? '#FFFFFF' : colors.success} />
                </View>
                <View style={[styles.countPill, { backgroundColor: activeTab === 'receipts' ? colors.success : colors.successSoft }]}>
                  <Text style={[styles.countPillText, { color: activeTab === 'receipts' ? '#FFFFFF' : colors.success }]}>
                    {receipts.length}
                  </Text>
                </View>
              </View>
              <Text style={[styles.gridCardTitle, { color: colors.text }]}>3. النقدية</Text>
              <Text style={[styles.gridCardDesc, { color: colors.secondaryText }]}>
                الفلوس اللي دفعها أو ادفعتله كاش
              </Text>
              <Text style={[styles.gridCardAmount, { color: colors.success }]}>
                {formatCurrency(balance?.total_paid)}
              </Text>
            </TouchableOpacity>

            {/* 4. كرت كشف الحساب */}
            <TouchableOpacity
              style={[
                styles.gridCard,
                { backgroundColor: colors.card, borderColor: activeTab === 'statement' ? '#6366F1' : colors.border },
                activeTab === 'statement' && { backgroundColor: '#EEF2FF', borderWidth: 2 },
              ]}
              onPress={() => setActiveTab('statement')}
              activeOpacity={0.8}
            >
              <View style={styles.gridCardHeader}>
                <View style={[styles.gridIconWrap, { backgroundColor: activeTab === 'statement' ? '#6366F1' : '#EEF2FF' }]}>
                  <Ionicons name="document-text" size={20} color={activeTab === 'statement' ? '#FFFFFF' : '#6366F1'} />
                </View>
                <View style={[styles.countPill, { backgroundColor: activeTab === 'statement' ? '#6366F1' : '#EEF2FF' }]}>
                  <Text style={[styles.countPillText, { color: activeTab === 'statement' ? '#FFFFFF' : '#6366F1' }]}>
                    {statement.length}
                  </Text>
                </View>
              </View>
              <Text style={[styles.gridCardTitle, { color: colors.text }]}>4. كشف حساب</Text>
              <Text style={[styles.gridCardDesc, { color: colors.secondaryText }]}>
                حركات الحساب التفصيلية والرصيد
              </Text>
              <Text style={[styles.gridCardAmount, { color: '#6366F1' }]}>
                كشف الحساب
              </Text>
            </TouchableOpacity>
          </View>

          {/* تفاصيل القسم المحدد أسفل الكروت */}
          <View style={styles.detailsContainer}>
            {/* عنوان القسم المحدد */}
            <View style={styles.detailHeaderRow}>
              <View style={styles.detailTitleGroup}>
                <Text style={[styles.detailSectionTitle, { color: colors.text }]}>
                  {activeTab === 'purchases' && 'سجل فواتير المشتريات من المخزن'}
                  {activeTab === 'returns' && 'سجل فواتير المرتجعات للمخزن'}
                  {activeTab === 'receipts' && 'سجل السندات والمدفوعات النقدية'}
                  {activeTab === 'statement' && 'كشف الحساب التفصيلي للحركات'}
                </Text>
                <Text style={[styles.detailSectionSubtitle, { color: colors.secondaryText }]}>
                  {activeTab === 'purchases' && `${invoices.length} فاتورة مشتريات مسجلة`}
                  {activeTab === 'returns' && `${returns.length} إشعار مرتجع مسجل`}
                  {activeTab === 'receipts' && `${receipts.length} سند قبض نقدي`}
                  {activeTab === 'statement' && `${statement.length} حركة حساب`}
                </Text>
              </View>
            </View>

            {/* تفاصيل المشتريات */}
            {activeTab === 'purchases' && (
              <View style={styles.tabContent}>
                {invoices.length === 0 ? (
                  <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="receipt-outline" size={44} color={colors.secondaryText} />
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>مفيش فواتير مشتريات متسجلة</Text>
                    <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
                      لسه مفيش فواتير طلعت لصيدليتك من المخزن ده لحد دلوقتي
                    </Text>
                  </View>
                ) : (
                  invoices.map((inv) => (
                    <View
                      key={inv.id}
                      style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={styles.itemCardHeader}>
                        <View style={[styles.statusBadge, { backgroundColor: colors.primarySoft }]}>
                          <Text style={[styles.statusBadgeText, { color: colors.primary }]}>
                            {inv.status === 'synced' ? 'فاتورة معتمدة' : inv.status}
                          </Text>
                        </View>
                        <View style={styles.itemHeaderLeft}>
                          <Text style={[styles.itemNumber, { color: colors.text }]}>
                            {inv.invoice_number}
                          </Text>
                          <Text style={[styles.itemDate, { color: colors.secondaryText }]}>
                            {formatDate(inv.invoice_date)}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.itemDivider, { backgroundColor: colors.border }]} />

                      <View style={styles.itemFinancialRow}>
                        <View style={styles.itemFinancialCol}>
                          <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>الإجمالي</Text>
                          <Text style={[styles.itemFinancialVal, { color: colors.text }]}>
                            {formatCurrency(inv.total_amount)}
                          </Text>
                        </View>
                        <View style={styles.itemFinancialCol}>
                          <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>الخصم</Text>
                          <Text style={[styles.itemFinancialVal, { color: colors.warning }]}>
                            {formatCurrency(inv.discount_amount)}
                          </Text>
                        </View>
                        <View style={styles.itemFinancialCol}>
                          <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>الصافي</Text>
                          <Text style={[styles.itemFinancialValBold, { color: colors.primary }]}>
                            {formatCurrency(inv.net_amount)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* تفاصيل المرتجعات */}
            {activeTab === 'returns' && (
              <View style={styles.tabContent}>
                {returns.length === 0 ? (
                  <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="arrow-undo-circle-outline" size={44} color={colors.secondaryText} />
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>مفيش مرتجعات متسجلة</Text>
                    <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
                      سجل المرتجعات تمام ومفيش أي أدوية راجعة للمخزن
                    </Text>
                  </View>
                ) : (
                  returns.map((ret, idx) => (
                    <View
                      key={ret.id || idx}
                      style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={styles.itemCardHeader}>
                        <View style={[styles.statusBadge, { backgroundColor: '#FEF3C7' }]}>
                          <Text style={[styles.statusBadgeText, { color: '#B45309' }]}>مرتجع معتمد</Text>
                        </View>
                        <View style={styles.itemHeaderLeft}>
                          <Text style={[styles.itemNumber, { color: colors.text }]}>
                            {ret.return_number || `إشعار مرتجع #${ret.remote_id || idx + 1}`}
                          </Text>
                          <Text style={[styles.itemDate, { color: colors.secondaryText }]}>
                            {formatDate(ret.return_date)}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.itemDivider, { backgroundColor: colors.border }]} />

                      <View style={styles.itemFinancialRow}>
                        <View style={styles.itemFinancialCol}>
                          <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>السبب / البيان</Text>
                          <Text style={[styles.itemFinancialVal, { color: colors.text }]}>
                            {ret.reason || 'مرتجع أصناف أدوية'}
                          </Text>
                        </View>
                        <View style={styles.itemFinancialCol}>
                          <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>صافي المرتجع</Text>
                          <Text style={[styles.itemFinancialValBold, { color: colors.warning }]}>
                            {formatCurrency(ret.net_amount || ret.total_amount)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* تفاصيل النقدية */}
            {activeTab === 'receipts' && (
              <View style={styles.tabContent}>
                {receipts.length === 0 ? (
                  <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="wallet-outline" size={44} color={colors.secondaryText} />
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>مفيش سندات قبض كاش متسجلة</Text>
                    <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
                      بتظهر هنا أي مبالغ نقدية سددتها لمندوب التحصيل
                    </Text>
                  </View>
                ) : (
                  receipts.map((rec, idx) => (
                    <View
                      key={rec.id || idx}
                      style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={styles.itemCardHeader}>
                        <View style={[styles.statusBadge, { backgroundColor: colors.successSoft }]}>
                          <Text style={[styles.statusBadgeText, { color: colors.success }]}>مسددة كاش</Text>
                        </View>
                        <View style={styles.itemHeaderLeft}>
                          <Text style={[styles.itemNumber, { color: colors.text }]}>
                            {rec.receipt_number || `سند قبض #${rec.remote_id || idx + 1}`}
                          </Text>
                          <Text style={[styles.itemDate, { color: colors.secondaryText }]}>
                            {formatDate(rec.receipt_date)}
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.itemDivider, { backgroundColor: colors.border }]} />

                      <View style={styles.itemFinancialRow}>
                        <View style={styles.itemFinancialCol}>
                          <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>طريقة الدفع / البيان</Text>
                          <Text style={[styles.itemFinancialVal, { color: colors.text }]}>
                            {rec.payment_method || rec.notes || 'خزينة رئيسية'}
                          </Text>
                        </View>
                        <View style={styles.itemFinancialCol}>
                          <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>المبلغ المسدد</Text>
                          <Text style={[styles.itemFinancialValBold, { color: colors.success }]}>
                            {formatCurrency(rec.amount)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}

            {/* تفاصيل كشف الحساب */}
            {activeTab === 'statement' && (
              <View style={styles.tabContent}>
                {statement.length === 0 ? (
                  <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="document-text-outline" size={44} color={colors.secondaryText} />
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>مفيش حركات كشف حساب مسجلة</Text>
                    <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
                      كل الحركات المالية هتظهر هنا أول ما تترحل في سيستم المخزن
                    </Text>
                  </View>
                ) : (
                  statement.map((stm, idx) => (
                    <View
                      key={stm.id || idx}
                      style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                    >
                      <View style={styles.itemCardHeader}>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor:
                                stm.debit > 0
                                  ? colors.primarySoft
                                  : colors.successSoft,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              { color: stm.debit > 0 ? colors.primary : colors.success },
                            ]}
                          >
                            {stm.doc_type || 'حركة حساب'}
                          </Text>
                        </View>
                        <View style={styles.itemHeaderLeft}>
                          <Text style={[styles.itemNumber, { color: colors.text }]}>
                            {stm.doc_number || `#${stm.remote_id}`}
                          </Text>
                          <Text style={[styles.itemDate, { color: colors.secondaryText }]}>
                            {formatDate(stm.entry_date)}
                          </Text>
                        </View>
                      </View>

                      {stm.description ? (
                        <Text style={[styles.stmDescription, { color: colors.secondaryText }]}>
                          {stm.description}
                        </Text>
                      ) : null}

                      <View style={[styles.itemDivider, { backgroundColor: colors.border }]} />

                      <View style={styles.itemFinancialRow}>
                        <View style={styles.itemFinancialCol}>
                          <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>مدين (+عليك)</Text>
                          <Text style={[styles.itemFinancialVal, { color: colors.primary }]}>
                            {stm.debit > 0 ? formatCurrency(stm.debit) : '—'}
                          </Text>
                        </View>
                        <View style={styles.itemFinancialCol}>
                          <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>دائن (-سددت)</Text>
                          <Text style={[styles.itemFinancialVal, { color: colors.success }]}>
                            {stm.credit > 0 ? formatCurrency(stm.credit) : '—'}
                          </Text>
                        </View>
                        <View style={styles.itemFinancialCol}>
                          <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>الرصيد بعدها</Text>
                          <Text style={[styles.itemFinancialValBold, { color: colors.text }]}>
                            {formatCurrency(stm.balance)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        </ScrollView>
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
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 8,
  },
  backBtnClean: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  topHeaderSpacer: {
    width: 40,
    height: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 14,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  mainCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1.5,
  },
  warehouseCardRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  warehouseIconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warehouseInfoCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 4,
  },
  onlineBadgeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#00d780',
  },
  onlineBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#00d780',
  },
  warehouseNameTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  pharmacyIdentityRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pharmacyTitleCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 3,
  },
  pharmacySubHead: {
    fontSize: 11,
    fontWeight: '600',
  },
  pharmacyNameLarge: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
  },
  pharmacyCodePill: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  linkedBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
  },
  linkedBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  cardDivider: {
    height: 1,
    marginVertical: 12,
  },
  balanceSection: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceInfoCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  balanceSubLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  balanceAmountLarge: {
    fontSize: 26,
    fontWeight: '900',
    marginTop: 2,
  },
  balanceStatusTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  balanceStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeaderRow: {
    alignItems: 'flex-end',
    marginTop: 4,
    marginBottom: -4,
    gap: 2,
  },
  sectionTitleLabel: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSubtitleLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  gridContainer: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  gridCard: {
    width: '48%',
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  gridCardHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gridIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  gridCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  gridCardDesc: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'right',
    minHeight: 28,
    lineHeight: 14,
  },
  gridCardAmount: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
    marginTop: 2,
  },
  detailsContainer: {
    gap: 12,
    marginTop: 6,
  },
  detailHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  detailTitleGroup: {
    alignItems: 'flex-end',
    gap: 2,
  },
  detailSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  detailSectionSubtitle: {
    fontSize: 11,
    fontWeight: '500',
  },
  tabContent: {
    gap: 10,
  },
  itemCard: {
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
  },
  itemCardHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemHeaderLeft: {
    alignItems: 'flex-end',
  },
  itemNumber: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemDate: {
    fontSize: 11,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stmDescription: {
    fontSize: 12,
    textAlign: 'right',
  },
  itemDivider: {
    height: 1,
  },
  itemFinancialRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  itemFinancialCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  itemFinancialLabel: {
    fontSize: 10,
    fontWeight: '500',
  },
  itemFinancialVal: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemFinancialValBold: {
    fontSize: 13,
    fontWeight: '800',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 240,
  },
});
