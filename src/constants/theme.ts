/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#102A43',
    background: '#F4F8FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E3F3F1',
    textSecondary: '#60758A',
    border: '#DCE8EC',
    primary: '#0F766E',
    primarySoft: '#DDF4F0',
    accent: '#F07C66',
    success: '#2D8A68',
    warning: '#C9822B',
    danger: '#C94A50',
  },
  dark: {
    text: '#EAF4F5',
    background: '#0B1720',
    backgroundElement: '#14252D',
    backgroundSelected: '#1E3E40',
    textSecondary: '#A6BBC0',
    border: '#28404A',
    primary: '#5BC9BB',
    primarySoft: '#183A3A',
    accent: '#F39480',
    success: '#62D1A4',
    warning: '#F0B35A',
    danger: '#F27B83',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
