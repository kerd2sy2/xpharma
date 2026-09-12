import React, { useEffect, useState } from 'react';
import { Dimensions, Platform, StatusBar, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import Animated, { FadeOut } from 'react-native-reanimated';
import LottieView from 'lottie-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Hide native splash once component mounts so Lottie animation is visible
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleFinish = () => {
    setTimeout(() => {
      setVisible(false);
    }, 250);
  };

  if (!visible) return null;

  return (
    <Animated.View exiting={FadeOut.duration(350)} style={styles.splashOverlay}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#0E051D"
        translucent={Platform.OS === 'android'}
      />
      <LottieView
        source={require('@/assets/lottie/letter_x.json')}
        autoPlay
        loop={false}
        onAnimationFinish={handleFinish}
        style={styles.fullscreenLottie}
        resizeMode="cover"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0E051D',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
  },
  fullscreenLottie: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
});
