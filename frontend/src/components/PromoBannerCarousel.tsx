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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// STRICT FIXED DIMENSIONS: Exactly 50% of screen height, 100% of screen width
export const BANNER_HEIGHT = Math.round(SCREEN_HEIGHT * 0.5);
export const BANNER_WIDTH = SCREEN_WIDTH;

interface PromoBannerCarouselProps {
  banners: Banner[];
  onWarehousePress?: (warehouseSlug: string) => void;
  topInset?: number;
}

export default function PromoBannerCarousel({ banners, onWarehousePress }: PromoBannerCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList<Banner>>(null);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const displayBanners = banners && banners.length > 0 ? banners : [];

  // Auto scroll every 5.5 seconds if multiple banners exist
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
    }, 5500);

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
    const index = Math.round(offsetX / BANNER_WIDTH);
    if (index >= 0 && index < displayBanners.length && index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  if (displayBanners.length === 0) {
    return null;
  }

  return (
    <View style={styles.bannerContainer}>
      <FlatList
        ref={flatListRef}
        data={displayBanners}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.bannerItem}
            activeOpacity={item.action_type !== 'none' ? 0.92 : 1}
            onPress={() => handleBannerPress(item)}
          >
            {/* Edge-to-Edge Background Image with resizeMode="cover" */}
            <Image
              source={{ uri: item.image_url }}
              style={styles.bannerImage}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />

            {/* Subtle Bottom Gradient for Text Legibility */}
            {(Boolean(item.title) || Boolean(item.subtitle)) && (
              <LinearGradient
                colors={['transparent', 'rgba(10, 3, 20, 0.45)', 'rgba(10, 3, 20, 0.88)']}
                style={styles.gradientOverlay}
              />
            )}

            {/* Top Badge Pill if configured */}
            {item.badge_text ? (
              <View style={styles.badgeWrapper}>
                <View style={styles.badgePill}>
                  <Ionicons name="sparkles" size={11} color="#3F0082" style={{ marginLeft: 3 }} />
                  <Text style={styles.badgeText}>{item.badge_text}</Text>
                </View>
              </View>
            ) : null}

            {/* Bottom Content: Title & Subtitle */}
            {(Boolean(item.title) || Boolean(item.subtitle)) ? (
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
            ) : null}
          </TouchableOpacity>
        )}
      />

      {/* Pagination Indicator Dots */}
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
  // FIXED CONTAINER: 100% Screen Width, Exactly 25% Screen Height, Edge-to-Edge
  bannerContainer: {
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#0F051D',
    position: 'relative',
  },
  bannerItem: {
    width: BANNER_WIDTH,
    height: BANNER_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  // RESIZEMODE COVER: Fills the entire container without distortion
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
  badgeWrapper: {
    position: 'absolute',
    top: 60,
    right: 16,
    zIndex: 3,
  },
  badgePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3F0082',
  },
  bottomContent: {
    zIndex: 3,
    gap: 3,
  },
  titleText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  subtitleText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#E0D8EE',
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    lineHeight: 16,
  },
  dotsContainer: {
    position: 'absolute',
    bottom: 6,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    zIndex: 4,
  },
  dot: {
    height: 4,
    borderRadius: 2,
  },
  activeDot: {
    width: 16,
    backgroundColor: '#FFFFFF',
  },
  inactiveDot: {
    width: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
});
