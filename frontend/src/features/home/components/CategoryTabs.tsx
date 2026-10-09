import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface CategoryTabsProps {
  selectedTab: 'pharma' | 'accessories';
  onSelectTab: (tab: 'pharma' | 'accessories') => void;
  isSticky?: boolean;
  backgroundColor?: string;
}

export default function CategoryTabs({
  selectedTab,
  onSelectTab,
  isSticky = false,
  backgroundColor = '#F9F7FD',
}: CategoryTabsProps) {
  return (
    <View
      style={[
        styles.categoryTabsContainer,
        { backgroundColor },
        isSticky && styles.categoryTabsSticky,
      ]}
    >
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
    paddingHorizontal: 24,
    backgroundColor: 'transparent',
    paddingTop: 4,
    paddingBottom: 0,
  },
  categoryTabsSticky: {
    backgroundColor: '#F9F7FD',
    paddingTop: 4,
    paddingBottom: 0,
  },
  categoryTab: {
    flex: 1,
    paddingVertical: 11,
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
    color: '#8A7B9B',
  },
  categoryTabTextActive: {
    color: '#3f0082',
    fontWeight: '800',
  },
});
