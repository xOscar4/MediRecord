import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import healthAnimation from '@/assets/animations/medirecord-health.json';
import { ThemedText } from '@/components/themed-text';
import { LottieAnimation, type LottieSource } from '@/components/lottie-animation';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AppIconName = { ios: SFSymbol; android: AndroidSymbol };

export function AppIcon({ name, color, size = 22 }: { name: AppIconName; color: string; size?: number }) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

export function BrandMark({ size = 54 }: { size?: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.brandMark, { width: size, height: size, borderRadius: size / 3, backgroundColor: theme.primarySoft }]}>
      <AppIcon name={{ ios: 'cross.case.fill', android: 'medical_services' }} color={theme.primary} size={size * 0.52} />
    </View>
  );
}

export function HealthIllustration() {
  return <LottieAnimation source={healthAnimation} size={164} accessibilityLabel="Ilustración animada de salud y medicamentos" />;
}

export function SurfaceCard({ children, style, ...props }: ViewProps) {
  const theme = useTheme();
  return (
    <View {...props} style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  const theme = useTheme();
  return <ThemedText type="smallBold" style={{ color: theme.primary, letterSpacing: 1.1 }}>{children.toUpperCase()}</ThemedText>;
}

export function StatusPill({ label, tone, compact = false, style }: { label: string; tone: 'success' | 'warning' | 'neutral'; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const backgroundColor = tone === 'success' ? `${theme.success}20` : tone === 'warning' ? `${theme.warning}20` : theme.primarySoft;
  const color = tone === 'success' ? theme.success : tone === 'warning' ? theme.warning : theme.primary;
  return (
    <View style={[styles.pill, compact && styles.pillCompact, { backgroundColor }, style]}>
      <View style={[styles.pillDot, { backgroundColor: color }]} />
      <ThemedText type="smallBold" numberOfLines={1} style={[{ color }, compact && styles.pillTextCompact]}>{label}</ThemedText>
    </View>
  );
}

export function AnimatedCard({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: object }) {
  return <Animated.View entering={FadeInDown.duration(360).delay(delay)} style={style}>{children}</Animated.View>;
}

export function QuickAction({ icon, label, hint, ...props }: PressableProps & { icon: AppIconName; label: string; hint: string }) {
  const theme = useTheme();
  return (
    <Pressable {...props} accessibilityRole="button" style={({ pressed }) => [styles.quickAction, { borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.82 : 1 }]}>
      <View style={[styles.quickIcon, { backgroundColor: theme.primarySoft }]}><AppIcon name={icon} color={theme.primary} size={20} /></View>
      <View style={styles.quickCopy}><ThemedText type="smallBold">{label}</ThemedText><ThemedText type="small" themeColor="textSecondary">{hint}</ThemedText></View>
      <AppIcon name={{ ios: 'chevron.right', android: 'chevron_right' }} color={theme.textSecondary} size={18} />
    </Pressable>
  );
}

export function EmptyState({ icon, title, body, animation }: { icon: AppIconName; title: string; body: string; animation?: { source: LottieSource; accessibilityLabel: string } }) {
  const theme = useTheme();
  return (
    <View style={styles.emptyState}>
      {animation ? <LottieAnimation source={animation.source} size={100} accessibilityLabel={animation.accessibilityLabel} /> : <View style={[styles.emptyIcon, { backgroundColor: theme.primarySoft }]}><AppIcon name={icon} color={theme.primary} size={28} /></View>}
      <ThemedText type="smallBold" style={styles.emptyTitle}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.emptyBody}>{body}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  brandMark: { alignItems: 'center', justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: 24, padding: Spacing.three, borderCurve: 'continuous', boxShadow: '0 8px 24px rgba(16, 42, 67, 0.07)' },
  pill: { alignItems: 'center', flexDirection: 'row', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  pillDot: { borderRadius: 99, height: 6, width: 6 },
  quickAction: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 68, paddingHorizontal: 14 },
  quickIcon: { alignItems: 'center', borderRadius: 14, height: 40, justifyContent: 'center', width: 40 },
  quickCopy: { flex: 1, gap: 2 },
  emptyState: { alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 18 },
  emptyIcon: { alignItems: 'center', borderRadius: 20, height: 56, justifyContent: 'center', marginBottom: 4, width: 56 },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { maxWidth: 270, textAlign: 'center' },
  pillCompact: { gap: 4, paddingHorizontal: 7, paddingVertical: 5 },
  pillTextCompact: { fontSize: 12, lineHeight: 16 },
});
