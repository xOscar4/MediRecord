import { DarkTheme, DefaultTheme, Stack, ThemeProvider, router, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { AppState, StyleSheet, View, useColorScheme } from 'react-native';
import { useEffect } from 'react';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useTheme } from '@/hooks/use-theme';
import MedicationAlarm from '@modules/medication-alarm';
import { flushPendingDoseResolutions } from '@/lib/dose-occurrences';
import { reconcileMedicationAlarms } from '@/lib/medication-alarm-reconciler';
import { AuthProvider, useAuth } from '@/providers/auth-provider';

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
      <AlarmCoordinator enabled={session !== null} />
      <Stack screenOptions={{ headerShown: false }}>
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

function AlarmCoordinator({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled || !MedicationAlarm.available) return;
    let mounted = true;

    async function reconcile() {
      await flushPendingDoseResolutions();
      await reconcileMedicationAlarms();
      if (!mounted) return;
      const active = await MedicationAlarm.getActiveAlarms();
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
    }

    void reconcile();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcile();
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [enabled, pathname]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
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
