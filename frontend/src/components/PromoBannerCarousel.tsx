import React, { useState, useRef, useEffect } from 'react';
import {
  Dimensions,
  FlatList,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Banner } from '@/services/banner';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isTablet = SCREEN_WIDTH >= 768;
const CARD_PADDING = 16;
const CARD_WIDTH = SCREEN_WIDTH - CARD_PADDING * 2;
const CARD_HEIGHT = isTablet ? 220 : 172;

interface PromoBannerCarouselProps {
  banners: Banner[];
  onWarehousePress?: (warehouseSlug: string) => void;
}

export default function PromoBannerCarousel({ banners, onWarehousePress }: PromoBannerCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<Banner>>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const displayBanners = banners && banners.length > 0 ? banners : [];

  // Auto scroll if multiple banners exist
  useEffect(() => {
    if (displayBanners.length <= 1) return;

    autoScrollTimer.current = setInterval(() => {
      setActiveIndex((prev) => {
        const nextIndex = (prev + 1) % displayBanners.length;
        flatListRef.current?.scrollToIndex({
          index: nextIndex,
          animated: true,
        });
        return nextIndex;
      });
    }, 6000);

    return () => {
      if (autoScrollTimer.current) clearInterval(autoScrollTimer.current);
    };
  }, [displayBanners.length]);

  const handleBannerPress = (banner: Banner) => {
    if (banner.action_type === 'url' && banner.action_value) {
      let targetUrl = banner.action_value.trim();
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = `https://${targetUrl}`;
      }
      Linking.openURL(targetUrl).catch((err) => console.warn('Could not open banner URL:', err));
    } else if (banner.action_type === 'warehouse' && banner.action_value && onWarehousePress) {
      onWarehousePress(banner.action_value.trim());
    }
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + 12));
    if (index >= 0 && index < displayBanners.length && index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  if (displayBanners.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={displayBanners}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled={false}
        snapToInterval={CARD_WIDTH + 12}
        snapToAlignment="center"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.cardContainer}
            activeOpacity={item.action_type !== 'none' ? 0.9 : 1}
            onPress={() => handleBannerPress(item)}
          >
            {/* Background Image with uniform fill */}
            <Image
              source={{ uri: item.image_url }}
              style={styles.bannerImage}
              contentFit="cover"
              transition={300}
              cachePolicy="memory-disk"
            />

            {/* Gradient Overlay for high text legibility */}
            <LinearGradient
              colors={['transparent', 'rgba(10, 0, 26, 0.35)', 'rgba(10, 0, 26, 0.88)']}
              style={styles.gradientOverlay}
            />

            {/* Top Row: Badge */}
            <View style={styles.topBadgeRow}>
              {item.badge_text ? (
                <View style={styles.badgePill}>
                  <Ionicons name="sparkles" size={11} color="#3F0082" style={{ marginLeft: 3 }} />
                  <Text style={styles.badgeText}>{item.badge_text}</Text>
                </View>
              ) : null}

              {item.action_type !== 'none' && (
                <View style={styles.actionPill}>
                  <Ionicons name="arrow-back" size={12} color="#FFFFFF" />
                </View>
              )}
            </View>

            {/* Bottom Content: Title & Subtitle */}
            <View style={styles.bottomContent}>
              {item.title ? (
                <Text style={styles.titleText} numberOfLines={1}>
                  {item.title}
                </Text>
              ) : null}
              {item.subtitle ? (
                <Text style={styles.subtitleText} numberOfLines={2}>
                  {item.subtitle}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Pagination Dots */}
      {displayBanners.length > 1 && (
        <View style={styles.dotsContainer}>
          {displayBanners.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i === activeIndex ? styles.activeDot : styles.inactiveDot,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  listContent: {
    paddingHorizontal: CARD_PADDING,
    gap: 12,
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#2A0058',
    justifyContent: 'space-between',
    padding: 14,
    shadowColor: '#3F0082',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  bannerImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  gradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3F0082',
  },
  actionPill: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomContent: {
    zIndex: 2,
    gap: 3,
  },
  titleText: {
    fontSize: isTablet ? 18 : 16,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1.5 },
    textShadowRadius: 4,
    letterSpacing: 0.2,
  },
  subtitleText: {
    fontSize: isTablet ? 13 : 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.88)',
    textAlign: 'right',
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
  activeDot: {
    width: 20,
    backgroundColor: '#3F0082',
  },
  inactiveDot: {
    width: 6,
    backgroundColor: '#D1C8E2',
  },
});
