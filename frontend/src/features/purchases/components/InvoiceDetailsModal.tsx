import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { InvoiceItem, InvoiceLineItem } from '@/services/warehouse';

interface InvoiceDetailsModalProps {
  invoice: InvoiceItem | null;
  items: InvoiceLineItem[];
  loading: boolean;
  showInfoModal: boolean;
  onClose: () => void;
  onToggleInfoModal: (val: boolean) => void;
  formatCurrency: (val: number | undefined) => string;
  formatDate: (val: string | undefined) => string;
}

export function InvoiceDetailsModal({
  invoice,
  items,
  loading,
  showInfoModal,
  onClose,
  onToggleInfoModal,
  formatCurrency,
  formatDate,
}: InvoiceDetailsModalProps) {
  if (!invoice) return null;

  return (
    <View style={styles.container}>
      {/* Top Header matching Tabarak screenshot */}
      <View style={styles.tabarakTopHeader}>
        <TouchableOpacity
          style={styles.tabarakHeaderIconBtn}
          onPress={() => onToggleInfoModal(true)}
          activeOpacity={0.6}
        >
          <Ionicons name="information-circle-outline" size={28} color="#1a2b6d" />
        </TouchableOpacity>

        <View style={styles.tabarakHeaderTitleBox}>
          <Text style={styles.tabarakHeaderMainTitle}>فاتورة شراء</Text>
          <View style={styles.tabarakHeaderActiveIndicator} />
        </View>

        <TouchableOpacity
          style={styles.tabarakHeaderIconBtn}
          onPress={onClose}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-forward" size={28} color="#1a2b6d" />
        </TouchableOpacity>
      </View>

      {/* Items List */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#3F0082" />
          <Text style={styles.loaderText}>جاري تحميل أصناف الفاتورة...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>لا توجد أصناف مسجلة لهذه الفاتورة</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => `${item.id || item.item_name || index}-${index}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const qty = item.quantity ?? 1;
            const price = item.unit_price ?? 0;
            const discount = item.discount_percent ?? 0;
            const total = item.total_price ?? (qty * price * (1 - discount / 100));

            return (
              <View style={styles.tabarakItemCard}>
                {/* اسم الصنف */}
                <View style={styles.tabarakItemTop}>
                  <Text style={styles.tabarakItemName} numberOfLines={2}>
                    {item.item_name || 'صنف غير محدد'}
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
                      {(item.bonus_quantity ?? 0) > 0 ? (
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
          }}
        />
      )}

      {/* Info Metadata Modal */}
      <Modal
        visible={showInfoModal}
        transparent
        animationType="fade"
        onRequestClose={() => onToggleInfoModal(false)}
      >
        <TouchableWithoutFeedback onPress={() => onToggleInfoModal(false)}>
          <View style={styles.infoModalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.infoModalCard}>
                <View style={styles.infoModalHeader}>
                  <Text style={styles.infoModalTitle}>تفاصيل الفاتورة</Text>
                  <TouchableOpacity onPress={() => onToggleInfoModal(false)}>
                    <Ionicons name="close" size={22} color="#1A0A33" />
                  </TouchableOpacity>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>رقم الفاتورة:</Text>
                  <Text style={styles.infoRowValue}>
                    #{invoice.invoice_number || invoice.remote_id || invoice.id}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>تاريخ الفاتورة:</Text>
                  <Text style={styles.infoRowValue}>
                    {formatDate(invoice.invoice_date)}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>إجمالي القيمة:</Text>
                  <Text style={styles.infoRowValue}>{formatCurrency(invoice.total_amount)}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>قيمة الخصم:</Text>
                  <Text style={[styles.infoRowValue, { color: '#EF4444' }]}>
                    {formatCurrency(invoice.discount_amount || 0)}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>الصافي المستحق:</Text>
                  <Text style={[styles.infoRowValue, { color: '#00D780', fontWeight: '800' }]}>
                    {formatCurrency(invoice.net_amount ?? invoice.total_amount)}
                  </Text>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9F7FD',
  },
  tabarakTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 16,
    paddingBottom: 14,
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
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loaderText: {
    fontSize: 14,
    color: '#6B5E82',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
  },
  listContent: {
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
  infoModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  infoModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  infoModalHeader: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E9E3F3',
    paddingBottom: 10,
  },
  infoModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A0A33',
  },
  infoRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoRowLabel: {
    fontSize: 13,
    color: '#6B5E82',
    fontWeight: '600',
  },
  infoRowValue: {
    fontSize: 13.5,
    color: '#1A0A33',
    fontWeight: '700',
  },
});
