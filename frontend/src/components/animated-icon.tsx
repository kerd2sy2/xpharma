import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { FadeOut } from 'react-native-reanimated';
import LottieView from 'lottie-react-native';

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Hide native splash once component mounts so Lottie animation is visible
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleFinish = () => {
    setTimeout(() => {
      setVisible(false);
    }, 400);
  };

  if (!visible) return null;

  return (
    <Animated.View exiting={FadeOut.duration(400)} style={styles.splashOverlay}>
      <View style={styles.centerBox}>
        <View style={styles.lottieContainer}>
          <LottieView
            source={require('@/assets/lottie/letter_x.json')}
            autoPlay
            loop={false}
            onAnimationFinish={handleFinish}
            style={styles.lottie}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.brandTitle}>إكس فارما</Text>
        <Text style={styles.brandSubtitle}>شبكة ربط الصيدليات والمخازن</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#0E051D',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  lottieContainer: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lottie: {
    width: 180,
    height: (180 * 1920) / 1280,
  },
  brandTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#F8FAFC',
    letterSpacing: 0.5,
    marginTop: 8,
  },
  brandSubtitle: {
    fontSize: 13,
    color: '#00d780',
    fontWeight: '700',
  },
});
