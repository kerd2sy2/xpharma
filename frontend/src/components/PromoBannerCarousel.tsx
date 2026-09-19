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
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Banner, formatBannerImageUrl } from '@/services/banner';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
export const BANNER_HEIGHT = Math.round(SCREEN_HEIGHT / 3);

interface PromoBannerCarouselProps {
  banners: Banner[];
  onWarehousePress?: (warehouseSlug: string) => void;
  topInset?: number;
}

export default function PromoBannerCarousel({ banners, onWarehousePress }: PromoBannerCarouselProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const currentBannerHeight = Math.round(windowHeight / 3);
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
    const index = Math.round(offsetX / windowWidth);
    if (index >= 0 && index < displayBanners.length && index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  if (displayBanners.length === 0) {
    return null;
  }

  const renderSingleBanner = (item: Banner, index = 0) => (
    <TouchableOpacity
      key={item.id || index}
      style={[styles.bannerItem, { width: windowWidth, height: currentBannerHeight }]}
      activeOpacity={item.action_type !== 'none' ? 0.92 : 1}
      onPress={() => handleBannerPress(item)}
    >
      {/* 100% Full Edge-to-Edge Centered Cover Image */}
      <Image
        source={{ uri: formatBannerImageUrl(item.image_url) }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="center"
        transition={200}
        cachePolicy="memory-disk"
      />

      {/* Top Gradient: Ensures Status Bar icons and floating header buttons are crystal clear */}
      <LinearGradient
        colors={[
          'rgba(10, 3, 20, 0.78)',
          'rgba(10, 3, 20, 0.40)',
          'rgba(10, 3, 20, 0.12)',
          'transparent',
        ]}
        locations={[0, 0.42, 0.75, 1]}
        style={styles.topGradient}
        pointerEvents="none"
      />

      {/* Bottom Gradient: Gives smooth luxury shading and ensures text legibility */}
      <LinearGradient
        colors={[
          'transparent',
          'rgba(10, 3, 20, 0.15)',
          'rgba(10, 3, 20, 0.52)',
          'rgba(10, 3, 20, 0.88)',
        ]}
        locations={[0, 0.35, 0.68, 1]}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

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
  );

  return (
    <View style={[styles.bannerContainer, { width: windowWidth, height: currentBannerHeight }]}>
      {displayBanners.length === 1 ? (
        renderSingleBanner(displayBanners[0])
      ) : (
        <FlatList
          ref={flatListRef}
          data={displayBanners}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          getItemLayout={(_, index) => ({
            length: windowWidth,
            offset: windowWidth * index,
            index,
          })}
          renderItem={({ item, index }) => renderSingleBanner(item, index)}
        />
      )}

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
  bannerContainer: {
    overflow: 'hidden',
    backgroundColor: '#0F051D',
    position: 'relative',
  },
  bannerItem: {
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 90,
    zIndex: 1,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 95,
    zIndex: 1,
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
