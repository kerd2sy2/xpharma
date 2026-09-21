import React from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface HomeSearchBarProps {
  searchQuery: string;
  onSearchChange: (text: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  inputRef?: React.RefObject<TextInput | null>;
  colors: {
    text: string;
    secondaryText: string;
    card: string;
    border: string;
    primary: string;
  };
}

export default function HomeSearchBar({
  searchQuery,
  onSearchChange,
  onClose,
  onSubmit,
  inputRef,
  colors,
}: HomeSearchBarProps) {
  return (
    <View style={styles.searchBarActiveContainer}>
      <TouchableOpacity
        style={styles.searchCloseBtn}
        onPress={onClose}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-forward" size={22} color={colors.text} />
      </TouchableOpacity>

      <View style={[styles.searchInputActiveWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.secondaryText} style={styles.searchInnerIcon} />
        <TextInput
          ref={inputRef as any}
          style={[styles.searchActiveTextInput, { color: colors.text }]}
          placeholder="ابحث باسم المخزن أو الصيدلية..."
          placeholderTextColor={colors.secondaryText}
          value={searchQuery}
          onChangeText={onSearchChange}
          returnKeyType="search"
          onSubmitEditing={onSubmit}
          autoFocus
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => onSearchChange('')} style={styles.searchClearBtn}>
            <Ionicons name="close-circle" size={18} color={colors.secondaryText} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  searchBarActiveContainer: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  searchCloseBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInputActiveWrapper: {
    flex: 1,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  searchInnerIcon: {
    marginLeft: 6,
  },
  searchActiveTextInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  searchClearBtn: {
    padding: 4,
  },
});
