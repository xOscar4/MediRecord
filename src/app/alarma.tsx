import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/form-controls';
import { AlarmVisual } from '@/components/alarm-visual';
import { SurfaceCard } from '@/components/ui-kit';
import { confirmDoseTaken } from '@/lib/dose-occurrences';
import MedicationAlarm from '@modules/medication-alarm';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type AlarmOutcome = 'taken' | 'already_resolved' | 'queued' | 'inactive' | null;

function formatScheduledAt(value: string | undefined): string {
  if (!value) return 'Ahora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Ahora';
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function AlarmaScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ occurrenceId?: string; medicationName?: string; dose?: string; scheduledAt?: string }>();
  const occurrenceId = typeof params.occurrenceId === 'string' ? params.occurrenceId : '';
  const [isBusy, setIsBusy] = useState(false);
  const [outcome, setOutcome] = useState<AlarmOutcome>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeExists, setActiveExists] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let mounted = true;
    MedicationAlarm.getActiveAlarms().then((active) => {
      if (mounted && occurrenceId && active.length > 0 && !active.some((alarm) => alarm.occurrenceId === occurrenceId)) {
        setActiveExists(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [occurrenceId]);

  const title = params.medicationName || 'Medicamento';
  const dose = params.dose || 'Dosis programada';
  const scheduledAt = useMemo(() => formatScheduledAt(params.scheduledAt), [params.scheduledAt]);

  async function handleConfirm() {
    if (isBusy || !occurrenceId) return;
    setError(null);
    setIsBusy(true);
    try {
      // La acción explícita detiene el mecanismo nativo antes de tocar el estado remoto.
      await MedicationAlarm.cancelAlarm(occurrenceId);
      const result = await confirmDoseTaken(occurrenceId);
      setOutcome(result);
      if (result !== 'queued') {
        setTimeout(() => router.replace('/'), 850);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'No pudimos registrar la toma.');
    } finally {
      setIsBusy(false);
    }
  }

  if (outcome || !activeExists) {
    const message = outcome === 'queued'
      ? 'La alarma se detuvo. Guardaremos la confirmación y la sincronizaremos cuando vuelva la conexión.'
      : outcome === 'already_resolved'
        ? 'Esta toma ya había sido resuelta y no se modificó de nuevo.'
        : 'La alarma ya no está activa.';
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.result}>
            <ThemedText type="title" style={styles.resultTitle}>{outcome === 'queued' ? 'Alarma detenida' : 'Toma revisada'}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centerText}>{message}</ThemedText>
            <ActionButton label="Volver a inicio" onPress={() => router.replace('/')} />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
          <SurfaceCard style={styles.alarmCard}>
            <AlarmVisual />
            <ThemedText type="smallBold" style={{ color: theme.accent }}>RECORDATORIO DE MEDICAMENTO</ThemedText>
            <ThemedText type="title" style={styles.title}>{title}</ThemedText>
            <ThemedText type="subtitle" themeColor="textSecondary">{dose}</ThemedText>
            <View style={[styles.timeBadge, { backgroundColor: theme.primarySoft }]}>
              <ThemedText type="title" style={{ color: theme.primary }}>{scheduledAt}</ThemedText>
            </View>
            {error ? <ThemedText type="small" style={{ color: theme.danger, textAlign: 'center' }}>{error}</ThemedText> : null}
            <ActionButton label="Cancelar alarma y registrar toma" onPress={() => void handleConfirm()} loading={isBusy} disabled={!occurrenceId} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>La toma seguirá pendiente hasta que confirmes esta acción.</ThemedText>
          </SurfaceCard>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four },
  alarmCard: { alignItems: 'center', gap: Spacing.three, padding: Spacing.four },
  title: { textAlign: 'center' },
  timeBadge: { alignItems: 'center', borderRadius: 18, minWidth: 132, paddingHorizontal: Spacing.four, paddingVertical: Spacing.two },
  hint: { textAlign: 'center' },
  result: { alignItems: 'center', flex: 1, gap: Spacing.three, justifyContent: 'center', padding: Spacing.four },
  resultTitle: { textAlign: 'center' },
  centerText: { maxWidth: 330, textAlign: 'center' },
});
