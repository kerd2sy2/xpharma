import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinkedPharmacyAccount, PharmacyBalance } from '@/services/warehouse';
import { defaultPortalColors, formatCurrency, PortalColors } from '../types';

interface PharmacyMasterCardProps {
  pharmacies: LinkedPharmacyAccount[];
  activePharmacyIndex: number;
  activeItem: LinkedPharmacyAccount;
  balance: PharmacyBalance | null;
  onSwitchPharmacy: (index: number) => void;
  onPressAddPharmacy: () => void;
  onPressUpgrade?: () => void;
  onPressSelectActive?: () => void;
  allowedPharmacies?: number;
  colors?: PortalColors;
}

export default function PharmacyMasterCard({
  pharmacies,
  activePharmacyIndex,
  activeItem,
  balance,
  onSwitchPharmacy,
  onPressAddPharmacy,
  onPressUpgrade,
  onPressSelectActive,
  allowedPharmacies = 1,
  colors = defaultPortalColors,
}: PharmacyMasterCardProps) {
  const hasDebt = (balance?.balance ?? 0) > 0;
  const hasCredit = (balance?.balance ?? 0) < 0;

  return (
    <View style={styles.masterCardWrapper}>
      {/* شريط التبديل السريع بين الفروع عند وجود أكثر من صيدلية */}
      {pharmacies.length > 1 && (
        <View style={styles.branchStripSection}>
          <View style={styles.branchStripHeader}>
            <Text style={[styles.branchStripTitle, { color: colors.secondaryText }]}>
              الفروع المسجلة ({pharmacies.length}):
            </Text>
            <TouchableOpacity
              onPress={onPressAddPharmacy}
              style={styles.branchAddInlineBtn}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={15} color={colors.primary} />
              <Text style={[styles.branchAddInlineText, { color: colors.primary }]}>
                ربط فرع إضافي
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.branchPillsRow}
          >
            {pharmacies.map((item, idx) => {
              const isActive = idx === activePharmacyIndex;
              return (
                <TouchableOpacity
                  key={`${item.pharmacy_code}_${idx}`}
                  style={[
                    styles.branchPill,
                    isActive
                      ? [styles.branchPillActive, { backgroundColor: colors.primary }]
                      : [styles.branchPillInactive, { borderColor: colors.border, backgroundColor: colors.card }],
                  ]}
                  onPress={() => onSwitchPharmacy(idx)}
                  activeOpacity={0.75}
                >
                  <Ionicons
                    name={isActive ? 'checkmark-circle' : 'business-outline'}
                    size={14}
                    color={isActive ? '#FFFFFF' : colors.secondaryText}
                  />
                  <Text
                    style={[
                      styles.branchPillText,
                      isActive ? styles.branchPillTextActive : { color: colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {item.pharmacy_name || `فرع #${item.pharmacy_code}`}
                  </Text>
                  {item.is_suspended && <View style={styles.suspendedMiniDot} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* الكرت القيادي للصيدلية */}
      <View style={[styles.masterCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* رأس الكرت: اسم الصيدلية، الكود، وحالة الربط */}
        <View style={styles.masterCardHeader}>
          <View style={[styles.masterIconBox, { backgroundColor: colors.primarySoft }]}>
            <Ionicons name="business" size={24} color={colors.primary} />
          </View>

          <View style={styles.masterInfoCol}>
            <Text style={[styles.masterPharmacyName, { color: colors.text }]} numberOfLines={1}>
              {activeItem.pharmacy_name || `صيدلية #${activeItem.pharmacy_code}`}
            </Text>
            <View style={styles.masterCodeRow}>
              <View style={styles.codeTag}>
                <Text style={styles.codeTagText}>كود الربط: #{activeItem.pharmacy_code}</Text>
              </View>
            </View>
          </View>

          <View>
            {activeItem.is_suspended ? (
              <View style={styles.statusPillSuspended}>
                <Ionicons name="pause-circle" size={13} color="#DC2626" />
                <Text style={styles.statusPillSuspendedText}>معلق مؤقتاً</Text>
              </View>
            ) : (
              <View style={styles.statusPillActive}>
                <Ionicons name="checkmark-circle" size={13} color="#059669" />
                <Text style={styles.statusPillActiveText}>نشط بالمخزن</Text>
              </View>
            )}
          </View>
        </View>

        {/* خط فاصل ناعم */}
        <View style={styles.masterDivider} />

        {/* لوحة المؤشرات المالية المدمجة */}
        <View style={styles.statsContainer}>
          <View style={styles.statsHeaderRow}>
            <Text style={[styles.statsHeaderTitle, { color: colors.secondaryText }]}>
              الموقف المالي الحالي مع المخزن
            </Text>
            <Text style={[styles.statsHeaderSub, { color: colors.secondaryText }]}>
              بالجنيه المصري
            </Text>
          </View>

          <View style={styles.statsMetricsRow}>
            {/* المؤشر الأول: الرصيد الحالي */}
            <View style={[styles.metricCard, styles.metricCardMain]}>
              <Text style={styles.metricLabel}>الرصيد المتبقي</Text>
              <Text
                style={[
                  styles.metricValue,
                  hasDebt ? styles.metricValueDebt : hasCredit ? styles.metricValueCredit : { color: colors.text },
                ]}
                numberOfLines={1}
              >
                {balance != null ? formatCurrency(balance.balance) : '—'}
              </Text>
              <Text style={styles.metricNote} numberOfLines={1}>
                {hasDebt
                  ? '• مستحق للمخزن'
                  : hasCredit
                  ? '• رصيد دائن لصالحك'
                  : '• الحساب خالص'}
              </Text>
            </View>

            {/* المؤشر الثاني: إجمالي المشتريات */}
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>إجمالي المشتريات</Text>
              <Text style={[styles.metricValue, { color: colors.primary }]} numberOfLines={1}>
                {balance?.total_purchases != null ? formatCurrency(balance.total_purchases) : '—'}
              </Text>
              <Text style={styles.metricNote}>مسحوبات</Text>
            </View>

            {/* المؤشر الثالث: إجمالي المسدد */}
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>إجمالي المسدد</Text>
              <Text style={[styles.metricValue, { color: '#059669' }]} numberOfLines={1}>
                {balance?.total_paid != null ? formatCurrency(balance.total_paid) : '—'}
              </Text>
              <Text style={styles.metricNote}>نقدية ومقبوضات</Text>
            </View>
          </View>
        </View>

        {/* بطاقة تنبيه التعليق عند اختيار فرع معلق */}
        {activeItem.is_suspended && (
          <View style={styles.suspendedWarningCard}>
            <View style={styles.suspendedWarningTop}>
              <Ionicons name="pause-circle" size={20} color="#D97706" />
              <Text style={styles.suspendedWarningTitle}>هذا الفرع معلق مؤقتاً</Text>
            </View>
            <Text style={styles.suspendedWarningDesc}>
              تم تعليق هذا الفرع لتجاوز الحد الأقصى المسموح به في باقتك الحالية ({allowedPharmacies} صيدلية).
              بياناتك وفواتيرك محفوظة بالكامل ولم يُحذف أي منها.
            </Text>
            <View style={styles.suspendedWarningActions}>
              {onPressUpgrade && (
                <TouchableOpacity
                  style={styles.suspendedUpgradeBtn}
                  onPress={onPressUpgrade}
                  activeOpacity={0.8}
                >
                  <Ionicons name="flash" size={14} color="#1A0A33" />
                  <Text style={styles.suspendedUpgradeBtnText}>ترقية الباقة ⚡</Text>
                </TouchableOpacity>
              )}
              {onPressSelectActive && (
                <TouchableOpacity
                  style={styles.suspendedSelectBtn}
                  onPress={onPressSelectActive}
                  activeOpacity={0.8}
                >
                  <Text style={styles.suspendedSelectBtnText}>اختيار الفروع النشطة</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  masterCardWrapper: {
    gap: 10,
    marginTop: 2,
    marginBottom: 2,
  },
  branchStripSection: {
    gap: 8,
  },
  branchStripHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  branchStripTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  branchAddInlineBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  branchAddInlineText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  branchPillsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  branchPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
    borderWidth: 1,
  },
  branchPillActive: {
    borderWidth: 0,
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  branchPillInactive: {
    elevation: 1,
  },
  branchPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  branchPillTextActive: {
    color: '#FFFFFF',
  },
  suspendedMiniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DC2626',
  },
  masterCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  masterCardHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  masterIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterInfoCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 4,
  },
  masterPharmacyName: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'right',
  },
  masterCodeRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  codeTag: {
    backgroundColor: '#F3EEFA',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  codeTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3f0082',
  },
  statusPillActive: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillActiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  statusPillSuspended: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillSuspendedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  masterDivider: {
    height: 1,
    backgroundColor: '#F3EEF9',
    marginVertical: 14,
  },
  statsContainer: {
    gap: 10,
  },
  statsHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  statsHeaderSub: {
    fontSize: 11,
    fontWeight: '500',
  },
  statsMetricsRow: {
    flexDirection: 'row-reverse',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FAF7FD',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: '#F0E8F8',
  },
  metricCardMain: {
    backgroundColor: '#F5EEFC',
    borderColor: '#E6D7F8',
  },
  metricLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#6B5E87',
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 2,
  },
  metricValueDebt: {
    color: '#DC2626',
  },
  metricValueCredit: {
    color: '#059669',
  },
  metricNote: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#8A7A9E',
    textAlign: 'center',
    marginTop: 1,
  },
  suspendedWarningCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  suspendedWarningTop: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  suspendedWarningTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
    textAlign: 'right',
  },
  suspendedWarningDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: '#B45309',
    textAlign: 'right',
    marginBottom: 10,
  },
  suspendedWarningActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  suspendedUpgradeBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FBBF24',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  suspendedUpgradeBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1A0A33',
  },
  suspendedSelectBtn: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  suspendedSelectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400E',
  },
});
