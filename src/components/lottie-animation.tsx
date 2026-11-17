import LottieView, { type LottieViewProps } from 'lottie-react-native';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export type LottieSource = LottieViewProps['source'];

type LottieAnimationProps = {
  source: LottieSource;
  size?: number;
  loop?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  visible?: boolean;
};

export function LottieAnimation({
  source,
  size = 120,
  loop = true,
  style,
  accessibilityLabel,
  visible = true,
}: LottieAnimationProps) {
  const animation = useRef<LottieView>(null);
  const isFocused = useIsFocused();
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setIsActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  const shouldPlay = visible && isFocused && isActive && !reduceMotion;

  useEffect(() => {
    if (shouldPlay) {
      animation.current?.reset();
      animation.current?.play();
    } else {
      animation.current?.pause();
      animation.current?.reset();
    }
  }, [shouldPlay, source]);

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={[styles.container, { height: size, width: size }, style]}>
      <LottieView
        ref={animation}
        autoPlay={false}
        cacheComposition
        loop={loop}
        resizeMode="contain"
        source={source}
        style={styles.animation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  animation: { height: '100%', width: '100%' },
});
