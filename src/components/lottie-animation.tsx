import LottieView, { type LottieViewProps } from 'lottie-react-native';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export type LottieSource = LottieViewProps['source'];

type LottieAnimationProps = {
  source: LottieSource;
  size?: number;
  /** Relación ancho/alto de la composición. Si se indica, `size` es el ancho. */
  aspectRatio?: number;
  loop?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel: string;
  visible?: boolean;
};

export function LottieAnimation({
  source,
  size = 120,
  aspectRatio,
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

  // Solo montamos la vista cuando puede ser vista. ReduceMotion no descarga la
  // animación: la deja pausada en su primer fotograma.
  const shouldMount = visible && isFocused && isActive;
  const shouldPlay = shouldMount && !reduceMotion;

  useEffect(() => {
    if (!animation.current) return;
    if (shouldPlay) {
      animation.current.reset();
      animation.current.play();
    } else {
      animation.current.pause();
      animation.current.reset();
    }
  }, [shouldMount, shouldPlay, source]);

  const dimensions = aspectRatio
    ? { height: size / aspectRatio, width: size }
    : { height: size, width: size };

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel} style={[styles.container, dimensions, style]}>
      {shouldMount ? (
        <LottieView
          ref={animation}
          autoPlay={false}
          cacheComposition
          loop={loop}
          resizeMode="contain"
          source={source}
          style={styles.animation}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Las ilustraciones Lottie se comportan como imágenes: se centran dentro de su
  // contenedor y nunca superan el ancho disponible en pantallas pequeñas.
  container: { alignItems: 'center', alignSelf: 'center', justifyContent: 'center', maxWidth: '100%' },
  animation: { height: '100%', width: '100%' },
});
