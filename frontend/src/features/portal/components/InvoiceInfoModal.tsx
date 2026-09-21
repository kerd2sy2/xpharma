import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InvoiceItem } from '@/services/warehouse';
import { defaultPortalColors, formatCurrency, formatDate, PortalColors } from '../types';

interface InvoiceInfoModalProps {
  visible: boolean;
  invoice: InvoiceItem | null;
  itemCount: number;
  onClose: () => void;
  colors?: PortalColors;
}

export default function InvoiceInfoModal({
  visible,
  invoice,
  itemCount,
  onClose,
  colors = defaultPortalColors,
}: InvoiceInfoModalProps) {
  if (!invoice) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalBackdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={[styles.modalCard, { backgroundColor: '#FFFFFF' }]}
          activeOpacity={1}
        >
          <View style={styles.modalHeaderRow}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle-outline" size={26} color={colors.secondaryText} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.text }]}>تفاصيل الفاتورة</Text>
          </View>

          <View style={styles.modalBody}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>رقم الفاتورة</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {invoice.invoice_number || invoice.remote_id}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>تاريخ الفاتورة</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {formatDate(invoice.invoice_date)}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>إجمالي الفاتورة</Text>
              <Text style={[styles.infoValue, { color: colors.primary }]}>
                {formatCurrency(invoice.total_amount || invoice.net_amount)}
              </Text>
            </View>

            {invoice.discount_amount ? (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>الخصم</Text>
                <Text style={[styles.infoValue, { color: '#EF4444' }]}>
                  {formatCurrency(invoice.discount_amount)}
                </Text>
              </View>
            ) : null}

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>الصافي</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {formatCurrency(invoice.net_amount || invoice.total_amount)}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>حالة الفاتورة</Text>
              <Text style={[styles.infoValue, { color: colors.success }]}>
                {invoice.status || 'مسجلة'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>عدد الأصناف</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {itemCount} صنف
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.modalCloseBtn, { backgroundColor: colors.primary }]}
            onPress={onClose}
          >
            <Text style={styles.modalCloseBtnText}>إغلاق</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  modalHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalBody: {
    gap: 12,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalCloseBtn: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
