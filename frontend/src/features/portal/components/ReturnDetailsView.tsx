import React from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InvoiceLineItem, ReturnItem } from '@/services/warehouse';
import { defaultPortalColors, formatCurrency, PortalColors } from '../types';

interface ReturnDetailsViewProps {
  returnItem: ReturnItem;
  lines: InvoiceLineItem[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onBack: () => void;
  onShowInfo: () => void;
  topInset?: number;
  colors?: PortalColors;
}

export default function ReturnDetailsView({
  returnItem,
  lines,
  loading,
  refreshing,
  onRefresh,
  onBack,
  onShowInfo,
  topInset = 24,
  colors = defaultPortalColors,
}: ReturnDetailsViewProps) {
  return (
    <View style={[styles.container, { backgroundColor: '#F8F9FB', paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FB" translucent={false} />

      {/* Header Bar */}
      <View style={styles.tabarakTopHeader}>
        <TouchableOpacity
          style={styles.tabarakHeaderIconBtn}
          onPress={onShowInfo}
          activeOpacity={0.6}
        >
          <Ionicons name="information-circle-outline" size={28} color="#1a2b6d" />
        </TouchableOpacity>

        <View style={styles.tabarakHeaderTitleBox}>
          <Text style={styles.tabarakHeaderMainTitle}>
            {returnItem.return_number || returnItem.remote_id || 'فاتورة مرتجع'}
          </Text>
          <View style={[styles.tabarakHeaderActiveIndicator, { backgroundColor: '#F59E0B' }]} />
        </View>

        <TouchableOpacity
          style={styles.tabarakHeaderIconBtn}
          onPress={onBack}
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-forward" size={26} color="#1a2b6d" />
        </TouchableOpacity>
      </View>

      {/* Line Items List */}
      <ScrollView
        contentContainerStyle={styles.tabarakScrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#F59E0B']} />
        }
      >
        {loading ? (
          <View style={styles.invoiceLoadingBox}>
            <ActivityIndicator size="small" color="#F59E0B" />
            <Text style={[styles.invoiceLoadingText, { color: colors.secondaryText }]}>
              جاري جلب تفاصيل الأصناف المرتجعة...
            </Text>
          </View>
        ) : lines.length === 0 ? (
          <View style={[styles.simpleEmptyBox, { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0' }]}>
            <Ionicons name="arrow-undo-outline" size={38} color={colors.secondaryText} />
            <Text style={[styles.simpleEmptyText, { color: colors.secondaryText }]}>
              لا توجد بنود مسجلة في هذا المرتجع
            </Text>
          </View>
        ) : (
          lines.map((item, idx) => {
            const qty = item.quantity ?? 1;
            const price = item.unit_price ?? 0;
            const discount = item.discount_percent ?? 0;
            const total = item.total_price ?? (qty * price * (1 - discount / 100));

            return (
              <View
                key={item.id || item.remote_item_id || `ret-item-${idx}`}
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
              {formatCurrency(returnItem.net_amount || returnItem.total_amount)}
            </Text>
          </View>

          <View style={styles.invoiceFooterCol}>
            <Text style={styles.invoiceFooterLabel}>الأصناف</Text>
            <Text style={[styles.invoiceFooterValue, { color: colors.primary }]}>
              {lines.length}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
