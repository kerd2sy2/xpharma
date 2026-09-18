import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatementItem } from '@/services/warehouse';

interface StatementRowProps {
  item: StatementItem;
  formatCurrency: (val: number | undefined) => string;
  formatDate: (val: string | undefined) => string;
}

export const StatementRow = React.memo(({ item, formatCurrency, formatDate }: StatementRowProps) => {
  const isDebit = (item.debit ?? 0) > 0;
  const isCredit = (item.credit ?? 0) > 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.descriptionText}>{item.description || 'حركة حساب'}</Text>
        <Text style={styles.dateText}>{formatDate(item.entry_date)}</Text>
      </View>

      <View style={styles.bodyRow}>
        {isDebit ? (
          <View style={styles.infoCol}>
            <Text style={styles.label}>مدين (مشتريات)</Text>
            <Text style={styles.debitText}>{formatCurrency(item.debit)}</Text>
          </View>
        ) : null}

        {isCredit ? (
          <View style={styles.infoCol}>
            <Text style={styles.label}>دائن (مسدد/مرتجع)</Text>
            <Text style={styles.creditText}>{formatCurrency(item.credit)}</Text>
          </View>
        ) : null}

        <View style={styles.dividerVertical} />

        <View style={styles.infoCol}>
          <Text style={styles.label}>الرصيد التراكمي</Text>
          <Text style={styles.balanceText}>{formatCurrency(item.balance)}</Text>
        </View>
      </View>
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
  descriptionText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1A0A33',
    flex: 1,
    textAlign: 'right',
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
  debitText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#EF4444',
  },
  creditText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#00D780',
  },
  balanceText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#3F0082',
  },
});
