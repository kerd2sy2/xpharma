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
import { InvoiceLineItem, ReturnItem } from '@/services/warehouse';

interface ReturnDetailsModalProps {
  returnItem: ReturnItem | null;
  items: InvoiceLineItem[];
  loading: boolean;
  showInfoModal: boolean;
  onClose: () => void;
  onToggleInfoModal: (val: boolean) => void;
  formatCurrency: (val: number | undefined) => string;
  formatDate: (val: string | undefined) => string;
}

export function ReturnDetailsModal({
  returnItem,
  items,
  loading,
  showInfoModal,
  onClose,
  onToggleInfoModal,
  formatCurrency,
  formatDate,
}: ReturnDetailsModalProps) {
  if (!returnItem) return null;

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBackBtn}
          onPress={onClose}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-forward" size={24} color="#1A0A33" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          فاتورة مرتجع #{returnItem.return_number || returnItem.remote_id || returnItem.id}
        </Text>

        <TouchableOpacity
          style={styles.headerInfoBtn}
          onPress={() => onToggleInfoModal(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="information-circle-outline" size={24} color="#EF4444" />
        </TouchableOpacity>
      </View>

      {/* Items List */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#EF4444" />
          <Text style={styles.loaderText}>جاري تحميل أصناف المرتجع...</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="cube-outline" size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>لا توجد أصناف مسجلة لهذا المرتجع</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item, index) => `${item.item_name || index}-${index}`}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <View style={styles.itemCard}>
              <View style={styles.itemNameRow}>
                <View style={styles.indexCircle}>
                  <Text style={styles.indexText}>{index + 1}</Text>
                </View>
                <Text style={styles.itemNameText}>{item.item_name || 'صنف غير محدد'}</Text>
              </View>

              <View style={styles.itemMetricsRow}>
                {/* Column 1: Quantity */}
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>الكمية</Text>
                  <Text style={styles.metricValueQty}>{item.quantity ?? 1}</Text>
                </View>

                <View style={styles.dividerVertical} />

                {/* Column 2: Price */}
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>السعر</Text>
                  <Text style={styles.metricValuePrice}>{formatCurrency(item.unit_price)}</Text>
                </View>

                <View style={styles.dividerVertical} />

                {/* Column 3: Total */}
                <View style={styles.metricCol}>
                  <Text style={styles.metricLabel}>الإجمالي</Text>
                  <Text style={styles.metricValueTotal}>{formatCurrency(item.total_price)}</Text>
                </View>
              </View>
            </View>
          )}
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
                  <Text style={styles.infoModalTitle}>تفاصيل المرتجع</Text>
                  <TouchableOpacity onPress={() => onToggleInfoModal(false)}>
                    <Ionicons name="close" size={22} color="#1A0A33" />
                  </TouchableOpacity>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>رقم المرتجع:</Text>
                  <Text style={styles.infoRowValue}>
                    #{returnItem.return_number || returnItem.remote_id || returnItem.id}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>تاريخ المرتجع:</Text>
                  <Text style={styles.infoRowValue}>
                    {formatDate(returnItem.return_date)}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>إجمالي القيمة:</Text>
                  <Text style={styles.infoRowValue}>{formatCurrency(returnItem.total_amount)}</Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoRowLabel}>الصافي المرتجع:</Text>
                  <Text style={[styles.infoRowValue, { color: '#EF4444', fontWeight: '800' }]}>
                    {formatCurrency(returnItem.net_amount ?? returnItem.total_amount)}
                  </Text>
                </View>

                {returnItem.reason ? (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoRowLabel}>السبب / ملاحظات:</Text>
                    <Text style={styles.infoRowValue}>{returnItem.reason}</Text>
                  </View>
                ) : null}
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
  header: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 12 : 16,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E9E3F3',
  },
  headerBackBtn: {
    padding: 6,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A0A33',
  },
  headerInfoBtn: {
    padding: 6,
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
    padding: 16,
    gap: 10,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E9E3F3',
  },
  itemNameRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  indexCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  itemNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A0A33',
    flex: 1,
    textAlign: 'right',
  },
  itemMetricsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F9F7FD',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  metricCol: {
    alignItems: 'center',
    flex: 1,
  },
  dividerVertical: {
    width: 1,
    height: 20,
    backgroundColor: '#E9E3F3',
  },
  metricLabel: {
    fontSize: 10.5,
    color: '#6B5E82',
    fontWeight: '600',
    marginBottom: 2,
  },
  metricValueQty: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A0A33',
  },
  metricValuePrice: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1A0A33',
  },
  metricValueTotal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#EF4444',
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
