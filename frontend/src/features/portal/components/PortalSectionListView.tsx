import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  InvoiceItem,
  ReceiptItem,
  ReturnItem,
  StatementItem,
} from '@/services/warehouse';
import { defaultPortalColors, formatCurrency, formatDate, PortalColors, SectionKey } from '../types';

interface PortalSectionListViewProps {
  sectionKey: SectionKey;
  sectionTitle: string;
  data: any[];
  loadingMore: boolean;
  hasMore: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
  onBack: () => void;
  onInvoicePress: (inv: InvoiceItem) => void;
  onReturnPress: (ret: ReturnItem) => void;
  topInset?: number;
  colors?: PortalColors;
}

export default function PortalSectionListView({
  sectionKey,
  sectionTitle,
  data,
  loadingMore,
  hasMore,
  refreshing,
  onRefresh,
  onLoadMore,
  onBack,
  onInvoicePress,
  onReturnPress,
  topInset = 24,
  colors = defaultPortalColors,
}: PortalSectionListViewProps) {
  const renderItem = ({ item, index }: { item: any; index: number }) => {
    if (sectionKey === 'purchases') {
      const inv = item as InvoiceItem;
      return (
        <TouchableOpacity
          key={inv.id || inv.remote_id}
          activeOpacity={0.7}
          onPress={() => onInvoicePress(inv)}
          style={[styles.simpleRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.rowCardRight}>
            <View style={styles.rowTitleRow}>
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
    }

    if (sectionKey === 'returns') {
      const ret = item as ReturnItem;
      return (
        <TouchableOpacity
          key={ret.id || ret.remote_id}
          activeOpacity={0.7}
          onPress={() => onReturnPress(ret)}
          style={[styles.simpleRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.rowCardRight}>
            <View style={styles.rowTitleRow}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                مرتجع #{ret.return_number || ret.remote_id || index + 1}
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
    }

    if (sectionKey === 'receipts') {
      const rec = item as ReceiptItem;
      return (
        <View
          key={rec.id || rec.remote_id}
          style={[styles.simpleRowCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.rowCardRight}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>
              إيصال #{rec.receipt_number || rec.remote_id || index + 1}
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
    }

    if (sectionKey === 'statement') {
      const stm = item as StatementItem;
      return (
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
    }

    return null;
  };

  const getEmptyMessage = () => {
    switch (sectionKey) {
      case 'purchases':
        return 'لا توجد فواتير مشتريات مسجلة';
      case 'returns':
        return 'لا توجد فواتير مرتجعات مسجلة';
      case 'receipts':
        return 'لا توجد حركات نقدية مسددة';
      case 'statement':
        return 'لا توجد حركات كشف حساب';
    }
  };

  const getEmptyIcon = () => {
    switch (sectionKey) {
      case 'purchases':
        return 'cart-outline';
      case 'returns':
        return 'arrow-undo-outline';
      case 'receipts':
        return 'cash-outline';
      case 'statement':
        return 'receipt-outline';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bg} translucent={false} />

      {/* Top Header */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backBtnClean}
          onPress={onBack}
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topHeaderTitle, { color: colors.text }]}>
          {sectionTitle}
        </Text>
        <View style={styles.topHeaderSpacer} />
      </View>

      {/* FlatList */}
      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item, index) =>
          item.id || item.remote_id || item.invoice_number || item.return_number || item.receipt_number || String(index)
        }
        contentContainerStyle={styles.subPageScrollContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={5}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.5}
        removeClippedSubviews={Platform.OS === 'android'}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />
        }
        ListEmptyComponent={
          <View style={[styles.simpleEmptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name={getEmptyIcon() as any} size={38} color={colors.secondaryText} />
            <Text style={[styles.simpleEmptyText, { color: colors.secondaryText }]}>
              {getEmptyMessage()}
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
            {!loadingMore && !hasMore && data.length >= 20 && (
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
  topHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  topHeaderSpacer: {
    width: 40,
  },
  subPageScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
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
  rowTitleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
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
