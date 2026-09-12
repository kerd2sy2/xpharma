import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import LottieView from 'lottie-react-native';

export interface XLogoHandle {
  play: () => void;
  reset: () => void;
}

interface XLogoProps {
  size?: number;
  width?: number;
  height?: number;
  resizeMode?: 'contain' | 'cover' | 'center';
  autoPlay?: boolean;
  loop?: boolean;
  progress?: number;
  style?: StyleProp<ViewStyle>;
  onAnimationFinish?: () => void;
}

const XLogo = forwardRef<XLogoHandle, XLogoProps>(function XLogo(
  {
    size = 38,
    width: customWidth,
    height: customHeight,
    resizeMode = 'contain',
    autoPlay = true,
    loop = true,
    progress,
    style,
    onAnimationFinish,
  },
  ref
) {
  const lottieRef = useRef<LottieView>(null);

  useImperativeHandle(ref, () => ({
    play: () => {
      lottieRef.current?.reset();
      lottieRef.current?.play();
    },
    reset: () => {
      lottieRef.current?.reset();
    },
  }));

  const containerWidth = customWidth ?? size;
  const containerHeight = customHeight ?? size;
  const lottieWidth = customWidth ?? size;
  const lottieHeight = customHeight ?? (size * 1920) / 1280;

  return (
    <View style={[styles.container, { width: containerWidth, height: containerHeight }, style]}>
      <LottieView
        ref={lottieRef}
        source={require('@/assets/lottie/letter_x.json')}
        autoPlay={autoPlay}
        loop={loop}
        progress={progress ?? (autoPlay ? undefined : 1)}
        onAnimationFinish={onAnimationFinish}
        style={{
          width: lottieWidth,
          height: lottieHeight,
        }}
        resizeMode={resizeMode}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

export default XLogo;
