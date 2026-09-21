import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ReturnItem } from '@/services/warehouse';
import { defaultPortalColors, formatCurrency, formatDate, PortalColors } from '../types';

interface ReturnInfoModalProps {
  visible: boolean;
  returnItem: ReturnItem | null;
  itemCount: number;
  onClose: () => void;
  colors?: PortalColors;
}

export default function ReturnInfoModal({
  visible,
  returnItem,
  itemCount,
  onClose,
  colors = defaultPortalColors,
}: ReturnInfoModalProps) {
  if (!returnItem) return null;

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
            <Text style={[styles.modalTitle, { color: colors.text }]}>تفاصيل المرتجع</Text>
          </View>

          <View style={styles.modalBody}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>رقم المرتجع</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {returnItem.return_number || returnItem.remote_id}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>تاريخ المرتجع</Text>
              <Text style={[styles.infoValue, { color: colors.text }]}>
                {formatDate(returnItem.return_date)}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>صافي المرتجع</Text>
              <Text style={[styles.infoValue, { color: colors.warning }]}>
                {formatCurrency(returnItem.net_amount || returnItem.total_amount)}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>حالة المرتجع</Text>
              <Text style={[styles.infoValue, { color: colors.success }]}>
                {returnItem.status || 'مسجل'}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>عدد الأصناف المرتجعة</Text>
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
