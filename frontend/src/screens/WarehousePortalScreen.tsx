import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchPharmacyBalance,
  fetchPharmacyPurchases,
  fetchPharmacyReturns,
  fetchPharmacyReceipts,
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
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 28) : 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset }]}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor={colors.card}
        translucent={false}
      />
      {/* Top Header */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.headerBtn, { borderColor: colors.border }]}
          onPress={onBack}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-forward" size={18} color={colors.text} />
          <Text style={[styles.headerBtnText, { color: colors.text }]}>المخازن</Text>
        </TouchableOpacity>

        <View style={styles.headerTitles}>
          <View style={[styles.warehousePill, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="business" size={13} color={colors.primary} />
            <Text style={[styles.warehousePillText, { color: colors.primary }]}>{warehouse.name}</Text>
          </View>
          <Text style={[styles.pharmacyNameText, { color: colors.text }]} numberOfLines={1}>
            {pharmacyName || 'الصيدلية'}
          </Text>
          <Text style={[styles.pharmacyCodeSub, { color: colors.secondaryText }]}>
            كود صيدليتك: {pharmacyCode}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.refreshBtn, { borderColor: colors.border }]}
          onPress={onRefresh}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.secondaryText }]}>
            بنحمل حساب صيدليتك من سيستم المخزن...
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
          }
        >
          {/* Balance & Summary Bar */}
          <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.balanceHeader}>
              <View style={[styles.balanceTag, { backgroundColor: colors.successSoft }]}>
                <Ionicons name="shield-checkmark" size={14} color={colors.success} />
                <Text style={[styles.balanceTagText, { color: colors.success }]}>حسابك مضبوط</Text>
              </View>
              <Text style={[styles.balanceLabel, { color: colors.secondaryText }]}>الرصيد المطلوب منك للمخزن</Text>
            </View>

            <View style={styles.balanceAmountRow}>
              <Text style={[styles.balanceAmount, { color: colors.text }]}>
                {formatCurrency(balance?.balance)}
              </Text>
            </View>

            <View style={[styles.metricsDivider, { backgroundColor: colors.border }]} />

            <View style={styles.metricsRow}>
              {/* Purchases */}
              <View style={styles.metricItem}>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>إجمالي المشتريات</Text>
                <Text style={[styles.metricValue, { color: colors.primary }]}>
                  {formatCurrency(balance?.total_purchases)}
                </Text>
              </View>

              {/* Returns */}
              <View style={styles.metricItem}>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>المرتجع</Text>
                <Text style={[styles.metricValue, { color: colors.warning }]}>
                  {formatCurrency(balance?.total_returns)}
                </Text>
              </View>

              {/* Paid Cash */}
              <View style={styles.metricItem}>
                <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>المسدد كاش</Text>
                <Text style={[styles.metricValue, { color: colors.success }]}>
                  {formatCurrency(balance?.total_paid)}
                </Text>
              </View>
            </View>
          </View>

          {/* 4 Interactive Tab Selectors */}
          <View style={[styles.tabsContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'purchases' && [styles.activeTabBtn, { backgroundColor: colors.primary }],
              ]}
              onPress={() => setActiveTab('purchases')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="cart-outline"
                size={16}
                color={activeTab === 'purchases' ? '#FFFFFF' : colors.secondaryText}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  { color: activeTab === 'purchases' ? '#FFFFFF' : colors.secondaryText },
                ]}
              >
                المشتريات ({invoices.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'returns' && [styles.activeTabBtn, { backgroundColor: colors.primary }],
              ]}
              onPress={() => setActiveTab('returns')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="arrow-undo-outline"
                size={16}
                color={activeTab === 'returns' ? '#FFFFFF' : colors.secondaryText}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  { color: activeTab === 'returns' ? '#FFFFFF' : colors.secondaryText },
                ]}
              >
                المرتجعات ({returns.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'receipts' && [styles.activeTabBtn, { backgroundColor: colors.primary }],
              ]}
              onPress={() => setActiveTab('receipts')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="cash-outline"
                size={16}
                color={activeTab === 'receipts' ? '#FFFFFF' : colors.secondaryText}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  { color: activeTab === 'receipts' ? '#FFFFFF' : colors.secondaryText },
                ]}
              >
                الكاش ({receipts.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'statement' && [styles.activeTabBtn, { backgroundColor: colors.primary }],
              ]}
              onPress={() => setActiveTab('statement')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="newspaper-outline"
                size={16}
                color={activeTab === 'statement' ? '#FFFFFF' : colors.secondaryText}
              />
              <Text
                style={[
                  styles.tabBtnText,
                  { color: activeTab === 'statement' ? '#FFFFFF' : colors.secondaryText },
                ]}
              >
                كشف الحساب
              </Text>
            </TouchableOpacity>
          </View>

          {/* Tab 1: فواتير المشتريات */}
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

          {/* Tab 2: المرتجعات */}
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

          {/* Tab 3: النقدية وسندات القبض */}
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
                        <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>طريقة الدفع</Text>
                        <Text style={[styles.itemFinancialVal, { color: colors.text }]}>
                          {rec.payment_method || 'نقدي لمندوب التحصيل'}
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

          {/* Tab 4: كشف الحساب */}
          {activeTab === 'statement' && (
            <View style={styles.tabContent}>
              {statement.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Ionicons name="document-text-outline" size={44} color={colors.secondaryText} />
                  <Text style={[styles.emptyTitle, { color: colors.text }]}>كشف الحساب فاضي حالياً</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
                    لسه مفيش حركات مالية أو فواتير متسجلة على الحساب
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
                        <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>عليك للمخزن (+)</Text>
                        <Text style={[styles.itemFinancialVal, { color: stm.debit > 0 ? colors.primary : colors.secondaryText }]}>
                          {stm.debit > 0 ? formatCurrency(stm.debit) : '—'}
                        </Text>
                      </View>
                      <View style={styles.itemFinancialCol}>
                        <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>سددت للمخزن (-)</Text>
                        <Text style={[styles.itemFinancialVal, { color: stm.credit > 0 ? colors.success : colors.secondaryText }]}>
                          {stm.credit > 0 ? formatCurrency(stm.credit) : '—'}
                        </Text>
                      </View>
                      <View style={styles.itemFinancialCol}>
                        <Text style={[styles.itemFinancialLabel, { color: colors.secondaryText }]}>الرصيد بعد الحركة</Text>
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
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  headerBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  headerTitles: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 8,
  },
  warehousePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 100,
    marginBottom: 2,
  },
  warehousePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  pharmacyNameText: {
    fontSize: 14,
    fontWeight: '800',
    maxWidth: 200,
  },
  pharmacyCodeSub: {
    fontSize: 11,
    fontWeight: '500',
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
  balanceCard: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
  },
  balanceHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceTag: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  balanceTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  balanceAmountRow: {
    alignItems: 'flex-end',
    marginTop: 2,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '900',
  },
  metricsDivider: {
    height: 1,
    marginVertical: 4,
  },
  metricsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
  },
  metricItem: {
    alignItems: 'flex-end',
    gap: 2,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  tabsContainer: {
    flexDirection: 'row-reverse',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
  },
  activeTabBtn: {
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '700',
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
