import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface CategoryTabsProps {
  selectedTab: 'pharma' | 'accessories';
  onSelectTab: (tab: 'pharma' | 'accessories') => void;
  isSticky?: boolean;
}

export default function CategoryTabs({
  selectedTab,
  onSelectTab,
  isSticky = false,
}: CategoryTabsProps) {
  return (
    <View style={[styles.categoryTabsContainer, isSticky && styles.categoryTabsSticky]}>
      <TouchableOpacity
        style={[
          styles.categoryTab,
          selectedTab === 'pharma' && styles.categoryTabActive,
        ]}
        onPress={() => onSelectTab('pharma')}
        activeOpacity={0.75}
      >
        <Text
          style={[
            styles.categoryTabText,
            selectedTab === 'pharma' && styles.categoryTabTextActive,
          ]}
        >
          أدوية
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.categoryTab,
          selectedTab === 'accessories' && styles.categoryTabActive,
        ]}
        onPress={() => onSelectTab('accessories')}
        activeOpacity={0.75}
      >
        <Text
          style={[
            styles.categoryTabText,
            selectedTab === 'accessories' && styles.categoryTabTextActive,
          ]}
        >
          إكسسوارات
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  categoryTabsContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDE7F6',
  },
  categoryTabsSticky: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  categoryTab: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2.5,
    borderBottomColor: 'transparent',
  },
  categoryTabActive: {
    borderBottomColor: '#3f0082',
  },
  categoryTabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#7B6F93',
  },
  categoryTabTextActive: {
    color: '#3f0082',
    fontWeight: '800',
  },
});
