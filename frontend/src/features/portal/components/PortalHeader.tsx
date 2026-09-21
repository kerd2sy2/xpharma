import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { defaultPortalColors, PortalColors } from '../types';

interface PortalHeaderProps {
  title: string;
  onBack: () => void;
  onRefresh?: () => void;
  colors?: PortalColors;
}

export default function PortalHeader({
  title,
  onBack,
  onRefresh,
  colors = defaultPortalColors,
}: PortalHeaderProps) {
  return (
    <View style={styles.topHeader}>
      <TouchableOpacity
        style={styles.backBtnClean}
        onPress={onBack}
        activeOpacity={0.6}
      >
        <Ionicons name="arrow-forward" size={24} color={colors.text} />
      </TouchableOpacity>

      <View style={styles.topHeaderTitleBox}>
        <Text style={[styles.topHeaderTitle, { color: colors.text }]} numberOfLines={1}>
          {title || 'المخزن'}
        </Text>
        <View style={styles.warehouseStatusRow}>
          <View style={styles.onlineDot} />
          <Text style={styles.warehouseSubtitle}>بوابة المورد • ربط مباشر</Text>
        </View>
      </View>

      {onRefresh ? (
        <TouchableOpacity
          style={styles.headerRefreshBtn}
          onPress={onRefresh}
          activeOpacity={0.6}
        >
          <Ionicons name="sync-outline" size={20} color={colors.secondaryText} />
        </TouchableOpacity>
      ) : (
        <View style={styles.topHeaderSpacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtnClean: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderTitleBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  warehouseStatusRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  warehouseSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7B6F93',
  },
  headerRefreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topHeaderSpacer: {
    width: 40,
  },
});
