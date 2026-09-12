import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
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
  scale?: number;
  speed?: number;
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
    scale = 1,
    speed = 1.35,
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
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [animKey, setAnimKey] = useState(0);

  useImperativeHandle(ref, () => ({
    play: () => {
      setIsPlaying(true);
      setAnimKey((k) => k + 1);
    },
    reset: () => {
      setIsPlaying(false);
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
        key={animKey}
        ref={lottieRef}
        source={require('@/assets/lottie/letter_x.json')}
        autoPlay={isPlaying}
        loop={isPlaying ? loop : false}
        speed={speed}
        progress={!isPlaying ? (progress ?? 1) : undefined}
        onAnimationFinish={onAnimationFinish}
        style={{
          width: lottieWidth,
          height: lottieHeight,
          transform: scale !== 1 ? [{ scale }] : undefined,
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
