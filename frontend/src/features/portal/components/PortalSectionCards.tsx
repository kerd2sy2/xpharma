import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { defaultPortalColors, PortalColors, PortalSectionConfig, SectionKey } from '../types';

interface PortalSectionCardsProps {
  sections: PortalSectionConfig[];
  onSelectSection: (key: SectionKey) => void;
  colors?: PortalColors;
}

export default function PortalSectionCards({
  sections,
  onSelectSection,
  colors = defaultPortalColors,
}: PortalSectionCardsProps) {
  return (
    <View style={styles.container}>
      {/* عنوان قسم العمليات والسجلات */}
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderRight}>
          <Ionicons name="layers-outline" size={17} color={colors.primary} />
          <Text style={[styles.sectionHeadingText, { color: colors.text }]}>
            سجلات وحركات المخزن
          </Text>
        </View>
        <Text style={[styles.sectionHeaderSub, { color: colors.secondaryText }]}>
          اضغط لعرض التفاصيل
        </Text>
      </View>

      {/* كروت الأقسام الأربعة */}
      <View style={styles.cardsListContainer}>
        {sections.map((sec) => (
          <TouchableOpacity
            key={sec.key}
            style={[styles.sectionNavCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => onSelectSection(sec.key)}
            activeOpacity={0.7}
          >
            {/* الأيقونة الملونة يمين الكرت */}
            <View style={[styles.navIconBox, { backgroundColor: sec.bgColor }]}>
              <Ionicons name={sec.icon} size={22} color={sec.color} />
            </View>

            {/* تفاصيل الكرت في المنتصف */}
            <View style={styles.navInfoCol}>
              <Text style={[styles.navTitle, { color: colors.text }]}>
                {sec.title}
              </Text>
              <Text style={[styles.navDesc, { color: colors.secondaryText }]} numberOfLines={1}>
                {sec.desc}
              </Text>
            </View>

            {/* بادج العدد وسهم الانتقال يسار الكرت */}
            <View style={styles.navLeftCol}>
              {sec.count != null && sec.count > 0 && (
                <View style={[styles.navCountBadge, { backgroundColor: sec.bgColor }]}>
                  <Text style={[styles.navCountBadgeText, { color: sec.color }]}>
                    {sec.count} {sec.key === 'purchases' ? 'فاتورة' : sec.key === 'returns' ? 'مرتجع' : sec.key === 'receipts' ? 'سند' : 'حركة'}
                  </Text>
                </View>
              )}
              <Ionicons name="chevron-back" size={18} color={colors.secondaryText} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  sectionHeaderRight: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  sectionHeadingText: {
    fontSize: 15,
    fontWeight: '800',
  },
  sectionHeaderSub: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  cardsListContainer: {
    gap: 10,
  },
  sectionNavCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1.5,
    gap: 12,
  },
  navIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navInfoCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  navTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  navDesc: {
    fontSize: 11.5,
    fontWeight: '500',
    textAlign: 'right',
  },
  navLeftCol: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  navCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  navCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
});
