import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { useEffect, useMemo } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useTheme } from '@/hooks/use-theme';
import MedicationAlarm from '@modules/medication-alarm';
import { flushPendingDoseResolutions } from '@/lib/dose-occurrences';
import { reconcileMedicationAlarms } from '@/lib/medication-alarm-reconciler';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { ThemePreferenceProvider, useThemePreference } from '@/providers/theme-provider';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, isInitializing } = useAuth();
  const theme = useTheme();

  // Mientras se resuelve la sesión persistida no montamos el navegador:
  // evita un parpadeo hacia login y avisos de rutas protegidas.
  if (isInitializing) {
    return <View style={[styles.loading, { backgroundColor: theme.background }]} />;
  }

  return (
    <>
      <AlarmCoordinator enabled={session !== null} userId={session?.user.id ?? null} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: Platform.OS === 'android' ? 'slide_from_right' : 'default',
          animationTypeForReplace: 'push',
        }}>
        <Stack.Protected guard={session !== null}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="medicamentos" />
          <Stack.Screen name="alarma" />
        </Stack.Protected>

        <Stack.Protected guard={session === null}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

function AlarmCoordinator({ enabled, userId }: { enabled: boolean; userId: string | null }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled || !userId) return;
    const activeUserId = userId;
    let mounted = true;

    async function reconcile() {
      try {
        await flushPendingDoseResolutions();
        // La cola offline es independiente del módulo nativo; el resto solo
        // aplica en Android con alarmas nativas disponibles.
        if (!MedicationAlarm.available) return;
        await reconcileMedicationAlarms();
        if (!mounted) return;
        const active = await MedicationAlarm.getActiveAlarms(activeUserId);
        if (active.length > 0 && pathname !== '/alarma') {
          const alarm = active[0];
          router.push({
            pathname: '/alarma',
            params: {
              occurrenceId: alarm.occurrenceId,
              medicationName: alarm.title,
              dose: alarm.dose ?? '',
              scheduledAt: alarm.scheduledAt,
            },
          });
        }
      } catch (error) {
        // Un fallo de red o del módulo nativo no debe romper la navegación.
        console.warn('[MediRecord] No se pudo sincronizar el estado de las alarmas.', error);
      }
    }

    void reconcile();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcile();
    });
    const retryTimer = setInterval(() => {
      if (AppState.currentState === 'active') void flushPendingDoseResolutions();
    }, 30_000);

    return () => {
      mounted = false;
      subscription.remove();
      clearInterval(retryTimer);
    };
  }, [enabled, pathname, userId]);

  return null;
}

export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <RootThemeShell />
    </ThemePreferenceProvider>
  );
}

function RootThemeShell() {
  const { scheme } = useThemePreference();
  const theme = useTheme();
  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: theme.background,
        card: theme.backgroundElement,
        text: theme.text,
        border: theme.border,
        primary: theme.primary,
      },
    };
  }, [scheme, theme]);

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <AuthProvider>
        <AnimatedSplashOverlay />
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
  },
});
