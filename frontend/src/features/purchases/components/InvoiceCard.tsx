import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InvoiceItem } from '@/services/warehouse';

interface InvoiceCardProps {
  item: InvoiceItem;
  onPress: (item: InvoiceItem) => void;
  formatCurrency: (val: number | undefined) => string;
  formatDate: (val: string | undefined) => string;
}

export const InvoiceCard = React.memo(({ item, onPress, formatCurrency, formatDate }: InvoiceCardProps) => {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => onPress(item)}
    >
      <View style={styles.headerRow}>
        <View style={styles.badgeNumber}>
          <Text style={styles.badgeNumberText}>
            #{item.invoice_number || item.remote_id || item.id}
          </Text>
        </View>
        <View style={styles.dateCol}>
          <Text style={styles.dateText}>{formatDate(item.invoice_date)}</Text>
        </View>
      </View>

      <View style={styles.bodyRow}>
        <View style={styles.infoCol}>
          <Text style={styles.label}>الصافي</Text>
          <Text style={styles.netAmount}>
            {formatCurrency(item.net_amount ?? item.total_amount)}
          </Text>
        </View>
        <View style={styles.dividerVertical} />
        <View style={styles.infoCol}>
          <Text style={styles.label}>الإجمالي</Text>
          <Text style={styles.totalAmount}>
            {formatCurrency(item.total_amount)}
          </Text>
        </View>
        <View style={styles.dividerVertical} />
        <View style={styles.infoCol}>
          <Text style={styles.label}>الخصم</Text>
          <Text style={styles.discountAmount}>
            {formatCurrency(item.discount_amount || 0)}
          </Text>
        </View>
      </View>

      <View style={styles.footerRow}>
        <View style={styles.viewItemsBtn}>
          <Ionicons name="eye-outline" size={15} color="#3F0082" />
          <Text style={styles.viewItemsText}>عرض تفاصيل وأصناف الفاتورة</Text>
        </View>
        <Ionicons name="chevron-back" size={16} color="#6B5E82" />
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E9E3F3',
  },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  badgeNumber: {
    backgroundColor: 'rgba(63, 0, 130, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeNumberText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#3F0082',
  },
  dateCol: {
    alignItems: 'flex-start',
  },
  dateText: {
    fontSize: 12,
    color: '#6B5E82',
    fontWeight: '500',
  },
  bodyRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#F9F7FD',
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  infoCol: {
    alignItems: 'center',
    flex: 1,
  },
  dividerVertical: {
    width: 1,
    height: 24,
    backgroundColor: '#E9E3F3',
  },
  label: {
    fontSize: 11,
    color: '#6B5E82',
    marginBottom: 2,
    fontWeight: '500',
  },
  netAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#00D780',
  },
  totalAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A0A33',
  },
  discountAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
  footerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  viewItemsBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  viewItemsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3F0082',
  },
});
