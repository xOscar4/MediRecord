import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { forwardRef } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TextFieldProps = TextInputProps & {
  label: string;
  hint?: string;
};

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField({ label, hint, style, ...inputProps }, ref) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        ref={ref}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.backgroundElement,
            borderColor: theme.border,
          },
          style,
        ]}
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
};

export function ActionButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  tone = 'primary',
}: ActionButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const backgroundColor =
    tone === 'primary' ? theme.primary : tone === 'danger' ? theme.danger : theme.backgroundElement;
  const textColor = tone === 'neutral' ? theme.text : '#ffffff';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={() => {
        scale.set(withTiming(0.97, { duration: 100 }));
      }}
      onPressOut={() => {
        scale.set(withTiming(1, { duration: 160 }));
      }}
      style={({ pressed }) => [
        { opacity: isDisabled ? 0.45 : pressed ? 0.9 : 1 },
      ]}>
      <Animated.View style={[styles.button, { backgroundColor }, animatedStyle]}>
        {loading ? (
          <ActivityIndicator color={textColor} />
        ) : (
          <ThemedText type="smallBold" style={[styles.buttonLabel, { color: textColor }]}>
            {label}
          </ThemedText>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.two,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  button: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  buttonLabel: {
    fontSize: 15,
  },
});
