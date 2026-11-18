import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, useWindowDimensions, View, type PressableProps, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { ReactNode } from 'react';

import healthAnimation from '@/assets/animations/medirecord-health.json';
import pillAnimation from '@/assets/animations/medirecord-pill.json';
import { ThemedText } from '@/components/themed-text';
import { LottieAnimation, type LottieSource } from '@/components/lottie-animation';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type AppIconName = { ios: SFSymbol; android: AndroidSymbol };

export function AppIcon({ name, color, size = 22 }: { name: AppIconName; color: string; size?: number }) {
  return <SymbolView name={name} tintColor={color} size={size} />;
}

export function BrandMark({ size = 54 }: { size?: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.brandMark, { width: size, height: size, borderRadius: size / 3, backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
      <AppIcon name={{ ios: 'cross.case.fill', android: 'medical_services' }} color={theme.primary} size={size * 0.5} />
    </View>
  );
}

export function HealthIllustration() {
  const { width } = useWindowDimensions();
  // La composición es 220x160. Calcular el ancho disponible evita que la
  // ilustración se desplace al borde o se recorte en pantallas estrechas.
  const size = Math.min(220, Math.max(140, width - 64));
  return (
    <LottieAnimation
      source={healthAnimation}
      size={size}
      aspectRatio={220 / 160}
      accessibilityLabel="Ilustración animada de salud y medicamentos"
    />
  );
}

export function SurfaceCard({ children, style, ...props }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      {...props}
      style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border, boxShadow: theme.shadow }, style]}>
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <ThemedText type="smallBold" style={[styles.sectionLabel, { color: theme.primary }]}>
      {children.toUpperCase()}
    </ThemedText>
  );
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

export function AnimatedCard({ children, delay = 0, style, exit = false }: { children: React.ReactNode; delay?: number; style?: object; exit?: boolean }) {
  return (
    <Animated.View
      entering={FadeInDown.duration(260).delay(delay).reduceMotion(ReduceMotion.System)}
      exiting={exit ? FadeOut.duration(150).reduceMotion(ReduceMotion.System) : undefined}
      style={style}>
      {children}
    </Animated.View>
  );
}

type AnimatedPressableProps = Omit<PressableProps, 'style'> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Pressable con un feedback de escala muy sutil, coherente en claro y oscuro. */
export function AnimatedPressable({ children, style, onPressIn, onPressOut, ...props }: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        scale.set(withTiming(0.97, { duration: 100, reduceMotion: ReduceMotion.System }));
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.set(withTiming(1, { duration: 160, reduceMotion: ReduceMotion.System }));
        onPressOut?.(event);
      }}
      style={style}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </Pressable>
  );
}

/** Estado de carga reutilizable: animación de pastilla + texto breve + líneas de contenido. */
export function LoadingState({ label, compact = false }: { label: string; compact?: boolean }) {
  const theme = useTheme();
  const animationSize = compact ? 44 : 60;
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={[styles.loadingState, compact && styles.loadingStateCompact]}>
      <LottieAnimation
        source={pillAnimation}
        size={animationSize}
        accessibilityLabel={label}
        style={{ backgroundColor: theme.primarySoft, borderRadius: Radius.pill }}
      />
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      {!compact ? (
        <View style={styles.skeleton}>
          <View style={[styles.skeletonLine, { backgroundColor: theme.border, width: '88%' }]} />
          <View style={[styles.skeletonLine, { backgroundColor: theme.border, width: '70%' }]} />
          <View style={[styles.skeletonLine, { backgroundColor: theme.primarySoft, width: '52%' }]} />
        </View>
      ) : null}
    </View>
  );
}

export function QuickAction({ icon, label, hint, ...props }: PressableProps & { icon: AppIconName; label: string; hint: string }) {
  const theme = useTheme();
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      style={({ pressed }) => [styles.quickAction, { borderColor: theme.border, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.82 : 1 }]}>
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
      {animation ? <LottieAnimation source={animation.source} size={96} accessibilityLabel={animation.accessibilityLabel} /> : <View style={[styles.emptyIcon, { backgroundColor: theme.primarySoft }]}><AppIcon name={icon} color={theme.primary} size={28} /></View>}
      <ThemedText type="smallBold" style={styles.emptyTitle}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.emptyBody}>{body}</ThemedText>
    </View>
  );
}

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  icon?: AppIconName;
  trailing?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, icon, trailing }: PageHeaderProps) {
  const theme = useTheme();
  return (
    <View style={styles.pageHeader}>
      <View style={styles.pageHeaderCopy}>
        <SectionLabel>{eyebrow}</SectionLabel>
        <ThemedText type="title" style={styles.pageTitle}>{title}</ThemedText>
        {description ? <ThemedText themeColor="textSecondary" style={styles.pageDescription}>{description}</ThemedText> : null}
      </View>
      {trailing ?? (icon ? (
        <View style={[styles.pageHeaderIcon, { backgroundColor: theme.primarySoft, borderColor: theme.border }]}>
          <AppIcon name={icon} color={theme.primary} size={26} />
        </View>
      ) : null)}
    </View>
  );
}

export function FormSection({ icon, title, description, children, style }: { icon: AppIconName; title: string; description?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <SurfaceCard style={[styles.formSection, style]}>
      <View style={styles.formSectionHeading}>
        <View style={[styles.formSectionIcon, { backgroundColor: theme.primarySoft }]}>
          <AppIcon name={icon} color={theme.primary} size={21} />
        </View>
        <View style={styles.formSectionCopy}>
          <ThemedText type="subtitle" style={styles.formSectionTitle}>{title}</ThemedText>
          {description ? <ThemedText type="small" themeColor="textSecondary">{description}</ThemedText> : null}
        </View>
      </View>
      <View style={styles.formSectionBody}>{children}</View>
    </SurfaceCard>
  );
}

export function InlineMessage({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const theme = useTheme();
  const color = tone === 'error' ? theme.danger : tone === 'success' ? theme.success : theme.primary;
  const icon: AppIconName = tone === 'error'
    ? { ios: 'exclamationmark.triangle.fill', android: 'warning' }
    : tone === 'success'
      ? { ios: 'checkmark.circle.fill', android: 'check_circle' }
      : { ios: 'info.circle.fill', android: 'info' };

  return (
    <View style={[styles.inlineMessage, { backgroundColor: `${color}14`, borderColor: `${color}33` }]}>
      <AppIcon name={icon} color={color} size={19} />
      <View style={styles.inlineMessageBody}>{typeof children === 'string' ? <ThemedText type="small" style={{ color }}>{children}</ThemedText> : children}</View>
    </View>
  );
}

export function SegmentedControl<T extends string>({ options, value, onChange, disabled = false }: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.background, borderColor: theme.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              { opacity: disabled ? 0.5 : pressed ? 0.78 : 1 },
            ]}>
            <ThemedText type="smallBold" style={{ color: selected ? theme.primary : theme.textSecondary }}>{option.label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  brandMark: { alignItems: 'center', borderWidth: 1, justifyContent: 'center' },
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.three, borderCurve: 'continuous' },
  sectionLabel: { fontSize: 11, letterSpacing: 1.4 },
  pill: { alignItems: 'center', flexDirection: 'row', gap: 6, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  pillDot: { borderRadius: Radius.pill, height: 6, width: 6 },
  pillCompact: { gap: 4, paddingHorizontal: 8, paddingVertical: 5 },
  pillTextCompact: { fontSize: 12, lineHeight: 16 },
  quickAction: { alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 66, paddingHorizontal: 14 },
  quickIcon: { alignItems: 'center', borderRadius: Radius.sm, height: 40, justifyContent: 'center', width: 40 },
  quickCopy: { flex: 1, gap: 2 },
  loadingState: { alignItems: 'center', gap: Spacing.two, paddingHorizontal: 8, paddingVertical: 22 },
  loadingStateCompact: { paddingVertical: 12 },
  skeleton: { alignItems: 'center', gap: 8, marginTop: 6, width: '100%' },
  skeletonLine: { borderRadius: Radius.pill, height: 10 },
  emptyState: { alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 18 },
  emptyIcon: { alignItems: 'center', borderRadius: Radius.lg, height: 58, justifyContent: 'center', marginBottom: 4, width: 58 },
  emptyTitle: { textAlign: 'center' },
  emptyBody: { maxWidth: 280, textAlign: 'center' },
  pageHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, justifyContent: 'space-between' },
  pageHeaderCopy: { flex: 1, gap: 5, minWidth: 0 },
  pageTitle: { fontSize: 32, lineHeight: 38, letterSpacing: -0.5 },
  pageDescription: { lineHeight: 22 },
  pageHeaderIcon: { alignItems: 'center', borderRadius: Radius.lg, borderWidth: 1, height: 58, justifyContent: 'center', width: 58 },
  formSection: { gap: Spacing.three },
  formSectionHeading: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  formSectionIcon: { alignItems: 'center', borderRadius: Radius.sm, height: 42, justifyContent: 'center', width: 42 },
  formSectionCopy: { flex: 1, gap: 2, minWidth: 0 },
  formSectionTitle: { fontSize: 21, lineHeight: 26 },
  formSectionBody: { gap: Spacing.three },
  inlineMessage: { alignItems: 'flex-start', borderRadius: Radius.sm, borderWidth: 1, flexDirection: 'row', gap: 9, padding: 12 },
  inlineMessageBody: { flex: 1, gap: 2, minWidth: 0 },
  segmented: { borderRadius: Radius.md, borderWidth: 1, flexDirection: 'row', gap: 3, padding: 3 },
  segment: { alignItems: 'center', borderRadius: 13, borderWidth: 1, borderColor: 'transparent', flex: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 8 },
});
