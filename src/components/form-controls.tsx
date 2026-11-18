import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { forwardRef, useState } from 'react';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { AppIcon, type AppIconName } from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, hint, style, onFocus, onBlur, ...inputProps },
  ref
) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        ref={ref}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.background,
            borderColor: isFocused ? theme.primary : theme.border,
          },
          style,
        ]}
        onFocus={(event) => {
          setIsFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setIsFocused(false);
          onBlur?.(event);
        }}
        {...inputProps}
      />
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
});

export type ActionButtonProps = {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  tone?: 'primary' | 'neutral' | 'danger';
  size?: 'default' | 'large';
  icon?: AppIconName;
};

export function ActionButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  tone = 'primary',
  size = 'default',
  icon,
}: ActionButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const backgroundColor =
    tone === 'primary' ? theme.primary : tone === 'danger' ? theme.danger : theme.backgroundElement;
  const textColor = tone === 'primary' ? theme.onPrimary : tone === 'danger' ? theme.onDanger : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={() => {
        scale.set(withTiming(0.97, { duration: 100, reduceMotion: ReduceMotion.System }));
      }}
      onPressOut={() => {
        scale.set(withTiming(1, { duration: 160, reduceMotion: ReduceMotion.System }));
      }}
      style={({ pressed }) => [
        { opacity: isDisabled ? 0.45 : pressed ? 0.9 : 1 },
      ]}>
      <Animated.View
        style={[
          styles.button,
          size === 'large' && styles.buttonLarge,
          {
            backgroundColor,
            borderColor: tone === 'neutral' ? theme.border : backgroundColor,
            boxShadow: isDisabled ? undefined : theme.shadow,
          },
          animatedStyle,
        ]}>
        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <>
            {icon ? <AppIcon name={icon} color={textColor} size={size === 'large' ? 22 : 19} /> : null}
            <ThemedText type="smallBold" style={[styles.buttonLabel, size === 'large' && styles.buttonLabelLarge, { color: textColor }]}>
              {label}
            </ThemedText>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  label: {
    letterSpacing: 0.4,
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '500',
  },
  button: {
    alignItems: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: Spacing.four,
  },
  buttonLarge: {
    borderRadius: Radius.lg,
    minHeight: 60,
    paddingHorizontal: Spacing.five,
  },
  buttonLabel: {
    fontSize: 15,
  },
  buttonLabelLarge: {
    fontSize: 17,
  },
});
