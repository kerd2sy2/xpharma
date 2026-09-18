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
const CARD_PADDING = 12;
const CARD_WIDTH = SCREEN_WIDTH - CARD_PADDING * 2;
const CARD_HEIGHT = isTablet ? 320 : 255;

interface PromoBannerCarouselProps {
  banners: Banner[];
  onWarehousePress?: (warehouseSlug: string) => void;
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
    const index = Math.round(offsetX / (CARD_WIDTH + 10));
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
        snapToInterval={CARD_WIDTH + 10}
        snapToAlignment="center"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.cardContainer}
            activeOpacity={item.action_type !== 'none' ? 0.92 : 1}
            onPress={() => handleBannerPress(item)}
          >
            {/* Full Hero Promo Background Image */}
            <Image
              source={{ uri: item.image_url }}
              style={styles.bannerImage}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />

            {/* Subtle Gradient Overlay for Text Readability */}
            <LinearGradient
              colors={[
                'rgba(15, 5, 30, 0.25)',
                'rgba(15, 5, 30, 0.05)',
                'rgba(15, 5, 30, 0.55)',
                'rgba(15, 5, 30, 0.92)',
              ]}
              locations={[0, 0.35, 0.65, 1]}
              style={styles.gradientOverlay}
            />

            {/* Top Row: Badge & Link Pill */}
            <View style={styles.topBadgeRow}>
              {item.badge_text ? (
                <View style={styles.badgePill}>
                  <Ionicons name="sparkles" size={11} color="#3F0082" style={{ marginLeft: 3 }} />
                  <Text style={styles.badgeText}>{item.badge_text}</Text>
                </View>
              ) : <View />}

              {item.action_type !== 'none' && (
                <View style={styles.actionPill}>
                  <Ionicons name="arrow-back" size={13} color="#FFFFFF" />
                </View>
              )}
            </View>

            {/* Bottom Content: Title & Subtitle */}
            {(Boolean(item.title) || Boolean(item.subtitle)) ? (
              <View style={styles.bottomContent}>
                {item.title ? (
                  <Text style={styles.titleText} numberOfLines={2}>
                    {item.title}
                  </Text>
                ) : null}
                {item.subtitle ? (
                  <Text style={styles.subtitleText} numberOfLines={2}>
                    {item.subtitle}
                  </Text>
                ) : null}
              </View>
            ) : <View />}
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
  container: {
    marginBottom: 10,
  },
  listContent: {
    paddingHorizontal: CARD_PADDING,
    gap: 10,
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1E1235',
    justifyContent: 'space-between',
    paddingTop: 62, // Leaves breathing room for floating top header
    paddingHorizontal: 16,
    paddingBottom: 16,
    shadowColor: '#3F0082',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
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
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 2,
  },
  badgePill: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  badgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#3F0082',
  },
  actionPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomContent: {
    zIndex: 2,
    gap: 4,
  },
  titleText: {
    fontSize: isTablet ? 20 : 17,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    lineHeight: isTablet ? 26 : 22,
  },
  subtitleText: {
    fontSize: isTablet ? 13.5 : 12.5,
    fontWeight: '600',
    color: '#E0D8EE',
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    lineHeight: 17,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    height: 5,
    borderRadius: 3,
  },
  activeDot: {
    width: 18,
    backgroundColor: '#3F0082',
  },
  inactiveDot: {
    width: 5,
    backgroundColor: '#3F008235',
  },
});
