/**
 * Tema efectivo de la aplicación. La preferencia (automático/claro/oscuro)
 * vive en `ThemePreferenceProvider` y persiste en el almacenamiento local.
 */

import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/providers/theme-provider';

export function useTheme() {
  const { scheme } = useThemePreference();

  return Colors[scheme];
}
