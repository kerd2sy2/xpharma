import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import LottieView from 'lottie-react-native';

interface XLogoProps {
  size?: number;
  autoPlay?: boolean;
  loop?: boolean;
  style?: StyleProp<ViewStyle>;
  onAnimationFinish?: () => void;
}

export default function XLogo({
  size = 38,
  autoPlay = true,
  loop = true,
  style,
  onAnimationFinish,
}: XLogoProps) {
  // letter_x aspect ratio is 1280 : 1920 (2:3)
  const width = size;
  const height = (size * 1920) / 1280;

  return (
    <View style={[styles.container, { width: size, height: size }, style]}>
      <LottieView
        source={require('@/assets/lottie/letter_x.json')}
        autoPlay={autoPlay}
        loop={loop}
        onAnimationFinish={onAnimationFinish}
        style={{
          width: width,
          height: height,
        }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
