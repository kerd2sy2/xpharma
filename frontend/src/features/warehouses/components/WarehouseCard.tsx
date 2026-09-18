import React from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Warehouse } from '@/services/warehouse';

interface WarehouseCardProps {
  item: Warehouse;
  onPress: (item: Warehouse) => void;
  width?: number;
  marginBottom?: number;
}

const defaultFallbackGradient: [string, string, string] = ['#151922', '#222A38', '#181D26'];

export const WarehouseCard = React.memo(({ item, onPress, width, marginBottom }: WarehouseCardProps) => {
  const getWarehouseVisual = (wh: Warehouse) => {
    const name = wh.name || 'مخزن أدوية';
    const category = wh.category || 'مخزن أدوية';
    const isPharma = category.includes('أدوية') || category.includes('ادوية');

    // Deterministic palette based on warehouse name
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const palettes = [
      { brandColor: '#3F0082', accentColor: '#3F0082', softBg: '#F3E8FF', softBorder: '#DDD6FE' },
      { brandColor: '#00804D', accentColor: '#059669', softBg: '#ECFDF5', softBorder: '#A7F3D0' },
      { brandColor: '#1E40AF', accentColor: '#2563EB', softBg: '#EFF6FF', softBorder: '#BFDBFE' },
      { brandColor: '#854D0E', accentColor: '#CA8A04', softBg: '#FEFCE8', softBorder: '#FEF08A' },
      { brandColor: '#4C1D95', accentColor: '#7C3AED', softBg: '#F5F3FF', softBorder: '#DDD6FE' },
    ];
    const chosen = palettes[Math.abs(hash) % palettes.length];

    return {
      ...chosen,
      iconName: isPharma ? ('pill' as const) : ('cube-outline' as const),
      brandTag: category,
    };
  };

  const visual = getWarehouseVisual(item);
  const logoUri = item.logo_url
    ? item.logo_url.startsWith('http')
      ? item.logo_url
      : `https://xpharma.cloud${item.logo_url}`
    : null;

  const categoryText = item.category || 'مخزن أدوية';
  const isPharma = categoryText.includes('أدوية') || categoryText.includes('ادوية');

  return (
    <TouchableOpacity
      style={[
        styles.appStoreBannerCard,
        width ? { width } : null,
        marginBottom !== undefined ? { marginBottom } : null,
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.9}
    >
      {/* 1. Solid Dark Foundation */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#13161D' }]} />

      {/* 2. Automatic Ambient Logo Blur */}
      {logoUri ? (
        <Image
          source={{ uri: logoUri }}
          style={styles.ambientBlurImage}
          blurRadius={Platform.select({ ios: 65, android: 25, default: 45 })}
          resizeMode="cover"
        />
      ) : (
        <LinearGradient
          colors={defaultFallbackGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* 3. Smooth Contrast Overlay */}
      <LinearGradient
        colors={['rgba(10, 14, 22, 0.42)', 'rgba(10, 14, 22, 0.2)', 'rgba(10, 14, 22, 0.48)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* 4. Card Content: App Icon on the Left, Name & Details on the Right */}
      <View style={styles.bannerContentRow}>
        {/* Left side: Warehouse Image / Logo Squircle */}
        <View style={styles.appIconSquircle}>
          {logoUri ? (
            <Image source={{ uri: logoUri }} style={styles.appIconImg} resizeMode="contain" />
          ) : (
            <View style={[styles.appIconFallback, { backgroundColor: visual.softBg }]}>
              <MaterialCommunityIcons name={visual.iconName} size={32} color={visual.accentColor} />
            </View>
          )}
        </View>

        {/* Right side: Name, Status & Category */}
        <View style={styles.bannerDetailsCol}>
          <Text style={styles.bannerTitleText} numberOfLines={2}>
            {item.name}
          </Text>

          <View style={styles.metaRow}>
            {item.is_linked ? (
              <View style={styles.statusItem}>
                <Ionicons name="checkmark-circle" size={14} color="#34D399" />
                <Text style={styles.statusTextLinked}>تم الربط</Text>
              </View>
            ) : (
              <View style={styles.statusItem}>
                <Ionicons name="link" size={13} color="rgba(255, 255, 255, 0.85)" />
                <Text style={styles.statusTextUnlinked}>ربط الآن</Text>
              </View>
            )}

            <Text style={styles.metaDot}>•</Text>

            <View style={styles.categoryItem}>
              <MaterialCommunityIcons
                name={isPharma ? 'pill' : 'cube-outline'}
                size={13}
                color="rgba(255, 255, 255, 0.75)"
              />
              <Text style={styles.categoryText} numberOfLines={1}>
                {categoryText}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  appStoreBannerCard: {
    minHeight: 96,
    borderRadius: 22,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  ambientBlurImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.72,
    transform: [{ scale: 1.35 }],
  },
  bannerContentRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bannerDetailsCol: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 14,
  },
  bannerTitleText: {
    width: '100%',
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    textAlign: 'right',
    marginBottom: 6,
    letterSpacing: -0.2,
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  metaRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  statusItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
  },
  statusTextLinked: {
    color: '#34D399',
    fontSize: 12.5,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statusTextUnlinked: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  metaDot: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    marginHorizontal: 8,
  },
  categoryItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    maxWidth: 130,
  },
  categoryText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  appIconSquircle: {
    width: 66,
    height: 66,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  appIconImg: {
    width: '100%',
    height: '100%',
  },
  appIconFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
