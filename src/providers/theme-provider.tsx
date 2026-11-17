import Storage from 'expo-sqlite/kv-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';

export type ThemeScheme = 'light' | 'dark';
export type ThemePreference = 'system' | ThemeScheme;

type ThemePreferenceValue = {
  /** Preferencia elegida por la persona usuaria. */
  preference: ThemePreference;
  /** Tema efectivo que deben consumir los componentes. */
  scheme: ThemeScheme;
  /** Indica si la preferencia guardada ya terminó de cargarse. */
  isReady: boolean;
  setPreference: (preference: ThemePreference) => Promise<void>;
};

const THEME_STORAGE_KEY = 'medirecord.theme-preference';

const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    Storage.getItem(THEME_STORAGE_KEY)
      .then((storedPreference) => {
        if (mounted && isThemePreference(storedPreference)) {
          setPreferenceState(storedPreference);
        }
      })
      .catch(() => {
        // Si la persistencia local no está disponible se mantiene el tema del sistema.
      })
      .finally(() => {
        if (mounted) setIsReady(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference);
    try {
      await Storage.setItem(THEME_STORAGE_KEY, nextPreference);
    } catch {
      // La preferencia sigue aplicada en memoria aunque no se pueda persistir.
    }
  }, []);

  const scheme: ThemeScheme = preference === 'system'
    ? (systemScheme === 'dark' ? 'dark' : 'light')
    : preference;

  const value = useMemo<ThemePreferenceValue>(
    () => ({ isReady, preference, scheme, setPreference }),
    [isReady, preference, scheme, setPreference]
  );

  return <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>;
}

/**
 * Devuelve la preferencia de tema. Si se usa fuera del proveedor (por ejemplo,
 * en pruebas aisladas) cae de forma segura al tema del sistema.
 */
export function useThemePreference(): ThemePreferenceValue {
  const context = useContext(ThemePreferenceContext);
  const systemScheme = useColorScheme();

  return context ?? {
    preference: 'system',
    scheme: systemScheme === 'dark' ? 'dark' : 'light',
    isReady: true,
    setPreference: async () => {},
  };
}
