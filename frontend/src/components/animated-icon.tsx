import React, { useEffect, useState } from 'react';
import { Dimensions, Platform, StatusBar, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { FadeOut } from 'react-native-reanimated';
import LottieView from 'lottie-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Hide native OS splash immediately so Lottie animation is seen first
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleFinish = () => {
    setTimeout(() => {
      setVisible(false);
    }, 150);
  };

  if (!visible) return null;

  return (
    <Animated.View exiting={FadeOut.duration(300)} style={styles.splashOverlay}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#FFFFFF"
        translucent={Platform.OS === 'android'}
      />
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
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999999,
    elevation: 999999,
  },
  lottieContainer: {
    width: SCREEN_WIDTH,
    height: (SCREEN_WIDTH * 1920) / 1280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: {
    width: '100%',
    height: '100%',
  },
});
