import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { BrandMark } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

const DURATION = 420;

export function AnimatedSplashOverlay() {
  const theme = useTheme();
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: { opacity: 1, transform: [{ scale: 1 }] },
    65: { opacity: 0.35, transform: [{ scale: 1.02 }], easing: Easing.out(Easing.cubic) },
    100: { opacity: 0, transform: [{ scale: 1.04 }], easing: Easing.out(Easing.cubic) },
  });

  const content = (
    <View style={styles.content}>
      <BrandMark size={82} />
      <ThemedText type="subtitle" style={styles.name}>MediRecord</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">Tu salud, en orden</ThemedText>
    </View>
  );

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) scheduleOnRN(setVisible, false);
      })}
      style={[styles.overlay, { backgroundColor: theme.background }]}> 
      {content}
    </Animated.View>
  ) : (
    <View onLayout={() => { SplashScreen.hideAsync().finally(() => setAnimate(true)); }} style={[styles.overlay, { backgroundColor: theme.background }]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  content: { alignItems: 'center', gap: 10 },
  name: { fontSize: 30, lineHeight: 36 },
});
