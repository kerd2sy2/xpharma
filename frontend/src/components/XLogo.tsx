import React from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import LottieView from 'lottie-react-native';

interface XLogoProps {
  size?: number;
  width?: number;
  height?: number;
  resizeMode?: 'contain' | 'cover' | 'center';
  autoPlay?: boolean;
  loop?: boolean;
  style?: StyleProp<ViewStyle>;
  onAnimationFinish?: () => void;
}

export default function XLogo({
  size = 38,
  width: customWidth,
  height: customHeight,
  resizeMode = 'contain',
  autoPlay = true,
  loop = true,
  style,
  onAnimationFinish,
}: XLogoProps) {
  const containerWidth = customWidth ?? size;
  const containerHeight = customHeight ?? size;
  const lottieWidth = customWidth ?? size;
  const lottieHeight = customHeight ?? (size * 1920) / 1280;

  return (
    <View style={[styles.container, { width: containerWidth, height: containerHeight }, style]}>
      <LottieView
        source={require('@/assets/lottie/letter_x.json')}
        autoPlay={autoPlay}
        loop={loop}
        onAnimationFinish={onAnimationFinish}
        style={{
          width: lottieWidth,
          height: lottieHeight,
        }}
        resizeMode={resizeMode}
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
