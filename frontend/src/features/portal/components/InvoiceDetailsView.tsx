import React from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InvoiceItem, InvoiceLineItem } from '@/services/warehouse';
import { defaultPortalColors, formatCurrency, PortalColors } from '../types';

interface InvoiceDetailsViewProps {
  invoice: InvoiceItem;
  lines: InvoiceLineItem[];
  loading: boolean;
  onBack: () => void;
  onShowInfo: () => void;
  topInset?: number;
  colors?: PortalColors;
}

export default function InvoiceDetailsView({
  invoice,
  lines,
  loading,
  onBack,
  onShowInfo,
  topInset = 24,
  colors = defaultPortalColors,
}: InvoiceDetailsViewProps) {
  return (
    <View style={[styles.container, { backgroundColor: '#F8F9FB', paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F9FB" translucent={false} />

      {/* Header Bar matching Tabarak app */}
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
            {invoice.invoice_number || invoice.remote_id}
          </Text>
          <View style={styles.tabarakHeaderActiveIndicator} />
        </View>

        <TouchableOpacity
          style={styles.tabarakHeaderIconBtn}
          onPress={onBack}
          activeOpacity={0.6}
        >
          <Ionicons name="arrow-forward" size={26} color="#1a2b6d" />
        </TouchableOpacity>
      </View>

      {/* Items Scrollable List */}
      <ScrollView
        contentContainerStyle={styles.tabarakScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.invoiceLoadingBox}>
            <ActivityIndicator size="large" color="#1a2b6d" />
            <Text style={[styles.invoiceLoadingText, { color: colors.secondaryText }]}>
              جاري تحميل أصناف الفاتورة...
            </Text>
          </View>
        ) : lines.length === 0 ? (
          <View style={[styles.simpleEmptyBox, { borderColor: '#E2E8F0', backgroundColor: '#FFFFFF' }]}>
            <Ionicons name="receipt-outline" size={44} color="#94A3B8" />
            <Text style={[styles.simpleEmptyText, { color: '#64748B' }]}>
              لا توجد بنود مسجلة لهذه الفاتورة
            </Text>
          </View>
        ) : (
          lines.map((item, idx) => {
            const qty = item.quantity || 1;
            const price = item.unit_price || 0;
            const total = item.total_price || qty * price;
            const discount = item.discount_percent || 0;

            return (
              <View key={item.id || item.remote_item_id || `${idx}`} style={styles.tabarakItemCard}>
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
              {formatCurrency(invoice.net_amount || invoice.total_amount)}
            </Text>
          </View>

          {invoice.discount_amount && invoice.discount_amount > 0 ? (
            <View style={styles.invoiceFooterCol}>
              <Text style={[styles.invoiceFooterLabel, { color: '#EF4444' }]}>الخصم</Text>
              <Text style={[styles.invoiceFooterValue, { color: '#EF4444' }]}>
                {formatCurrency(invoice.discount_amount)}
              </Text>
            </View>
          ) : null}

          {invoice.discount_amount && invoice.discount_amount > 0 ? (
            <View style={styles.invoiceFooterCol}>
              <Text style={styles.invoiceFooterLabel}>قبل الخصم</Text>
              <Text style={styles.invoiceFooterValue}>
                {formatCurrency(
                  (invoice.net_amount || invoice.total_amount || 0) + invoice.discount_amount
                )}
              </Text>
            </View>
          ) : null}

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
