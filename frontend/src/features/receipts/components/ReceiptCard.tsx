import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ReceiptItem } from '@/services/warehouse';

interface ReceiptCardProps {
  item: ReceiptItem;
  formatCurrency: (val: number | undefined) => string;
  formatDate: (val: string | undefined) => string;
}

export const ReceiptCard = React.memo(({ item, formatCurrency, formatDate }: ReceiptCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.badgeNumber}>
          <Text style={styles.badgeNumberText}>
            #{item.receipt_number || item.remote_id || item.id}
          </Text>
        </View>
        <Text style={styles.dateText}>{formatDate(item.receipt_date)}</Text>
      </View>

      <View style={styles.bodyRow}>
        <View style={styles.infoCol}>
          <Text style={styles.label}>المبلغ المسدد</Text>
          <Text style={styles.amountText}>{formatCurrency(item.amount)}</Text>
        </View>
        {item.payment_method ? (
          <>
            <View style={styles.dividerVertical} />
            <View style={styles.infoCol}>
              <Text style={styles.label}>طريقة الدفع</Text>
              <Text style={styles.methodText}>{item.payment_method}</Text>
            </View>
          </>
        ) : null}
      </View>

      {item.notes ? (
        <View style={styles.notesBox}>
          <Text style={styles.notesText}>{item.notes}</Text>
        </View>
      ) : null}
    </View>
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
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeNumberText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4338CA',
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
  amountText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#4338CA',
  },
  methodText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A0A33',
  },
  notesBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  notesText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'right',
  },
});
