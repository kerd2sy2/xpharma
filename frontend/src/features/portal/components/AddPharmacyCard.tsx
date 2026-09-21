import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { defaultPortalColors, PortalColors } from '../types';

interface AddPharmacyCardProps {
  onPress: () => void;
  colors?: PortalColors;
}

export default function AddPharmacyCard({
  onPress,
  colors = defaultPortalColors,
}: AddPharmacyCardProps) {
  return (
    <TouchableOpacity
      style={[
        styles.addPharmacyCard,
        { backgroundColor: colors.card, borderColor: '#D8C7F2' },
      ]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      <View style={[styles.addPharmacyIconCircle, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="business" size={22} color={colors.primary} />
        <View style={styles.addPlusBadge}>
          <Ionicons name="add" size={11} color="#FFFFFF" />
        </View>
      </View>

      <View style={styles.addPharmacyInfoCol}>
        <Text style={[styles.addPharmacyTitle, { color: colors.text }]}>
          ربط صيدلية أو فرع إضافي
        </Text>
        <Text style={[styles.addPharmacySubtitle, { color: colors.secondaryText }]}>
          أدخل كود صيدلية أخرى لنفس المخزن للتبديل السريع بين فروعك
        </Text>
      </View>

      <View style={[styles.addPharmacyBtnPill, { backgroundColor: colors.primary }]}>
        <Ionicons name="add" size={14} color="#FFFFFF" />
        <Text style={styles.addPharmacyBtnText}>ربط فرع</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  addPharmacyCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 6,
    marginBottom: 8,
    gap: 12,
    shadowColor: '#3f0082',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  addPharmacyIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  addPlusBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#3f0082',
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  addPharmacyInfoCol: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  addPharmacyTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    textAlign: 'right',
  },
  addPharmacySubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    textAlign: 'right',
    lineHeight: 16,
  },
  addPharmacyBtnPill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  addPharmacyBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
});
