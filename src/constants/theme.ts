/**
 * Paleta y tokens visuales de MediRecord (estilo Medical Premium).
 * Los colores están definidos para modo claro y oscuro y deben consumirse
 * siempre a través de `useTheme()` para que el tema se aplique solo.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#172B3A',
    background: '#F4F8FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E7F4F1',
    textSecondary: '#718096',
    border: '#E5EDF1',
    primary: '#0F766E',
    primarySoft: '#E7F4F1',
    secondary: '#123047',
    accent: '#D97757',
    success: '#2D8A68',
    warning: '#B7791F',
    danger: '#C94A50',
    onPrimary: '#FFFFFF',
    onDanger: '#FFFFFF',
    hero: '#0F766E',
    heroText: '#FFFFFF',
    heroMuted: '#D5EDE9',
    shadow: '0 10px 30px rgba(18, 48, 71, 0.08)',
    overlay: 'rgba(9, 30, 40, 0.45)',
  },
  dark: {
    text: '#F1F5F9',
    background: '#101B24',
    backgroundElement: '#192936',
    backgroundSelected: '#203B40',
    textSecondary: '#A5B4C3',
    border: '#2B3D49',
    primary: '#45B8A7',
    primarySoft: '#163A38',
    secondary: '#8CBFC8',
    accent: '#F39480',
    success: '#62D1A4',
    warning: '#F0B35A',
    danger: '#F27B83',
    onPrimary: '#06231F',
    onDanger: '#2A0B0E',
    hero: '#132E36',
    heroText: '#F1F5F9',
    heroMuted: '#A9C9CC',
    shadow: '0 12px 32px rgba(0, 0, 0, 0.32)',
    overlay: 'rgba(0, 0, 0, 0.62)',
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

export const Radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
