import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import successAnimation from '@/assets/animations/medirecord-success.json';
import { ActionButton } from '@/components/form-controls';
import { AlarmVisual } from '@/components/alarm-visual';
import { LottieAnimation } from '@/components/lottie-animation';
import { MedicationPhotoThumbnail } from '@/components/medication-photo-section';
import { AnimatedCard, AppIcon, BrandMark, SurfaceCard } from '@/components/ui-kit';
import { confirmDoseTaken, prepareDoseConfirmation } from '@/lib/dose-occurrences';
import { supabase } from '@/lib/supabase';
import MedicationAlarm from '@modules/medication-alarm';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';

type AlarmOutcome = 'taken' | 'already_resolved' | 'queued' | 'inactive' | null;

function formatScheduledAt(value: string | undefined): string {
  if (!value) return 'Ahora';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Ahora';
  return new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function formatScheduledDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export default function AlarmaScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ occurrenceId?: string; medicationName?: string; dose?: string; scheduledAt?: string }>();
  const occurrenceId = typeof params.occurrenceId === 'string' ? params.occurrenceId : '';
  const userId = session?.user.id ?? '';
  const [isBusy, setIsBusy] = useState(false);
  const [outcome, setOutcome] = useState<AlarmOutcome>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeExists, setActiveExists] = useState(true);
  const [photoPath, setPhotoPath] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!userId) return;
    MedicationAlarm.getActiveAlarms(userId).then((active) => {
      if (mounted && occurrenceId && active.length > 0 && !active.some((alarm) => alarm.occurrenceId === occurrenceId)) {
        setActiveExists(false);
      }
    }).catch((caughtError) => {
      console.warn('[MediRecord] No se pudo leer el estado nativo de la alarma.', caughtError);
    });
    return () => {
      mounted = false;
    };
  }, [occurrenceId, userId]);

  // Lectura opcional de la fotografía para reforzar la identificación visual.
  // Si falla o no hay conexión, se mantiene el icono médico de respaldo.
  useEffect(() => {
    let mounted = true;
    if (!userId || !occurrenceId) return;

    void (async () => {
      try {
        const { data } = await supabase
          .from('dose_occurrences_view')
          .select('medication_photo_path')
          .eq('id', occurrenceId)
          .eq('user_id', userId)
          .maybeSingle();
        if (mounted) setPhotoPath(data?.medication_photo_path ?? null);
      } catch {
        // La pantalla de alarma funciona igual sin fotografía.
      }
    })();

    return () => {
      mounted = false;
    };
  }, [occurrenceId, userId]);

  const title = params.medicationName || 'Medicamento';
  const dose = params.dose || 'Dosis programada';
  const scheduledAt = useMemo(() => formatScheduledAt(params.scheduledAt), [params.scheduledAt]);
  const scheduledDate = useMemo(() => formatScheduledDate(params.scheduledAt), [params.scheduledAt]);

  async function handleConfirm() {
    if (isBusy || !occurrenceId || !userId) return;
    setError(null);
    setIsBusy(true);
    try {
      // La acción explícita detiene el mecanismo nativo antes de tocar el estado remoto.
      await prepareDoseConfirmation(occurrenceId);
      if (MedicationAlarm.available) {
        await MedicationAlarm.cancelAlarm(occurrenceId, userId);
      }
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
        : outcome === 'taken'
          ? 'La toma quedó registrada correctamente.'
          : 'La alarma ya no está activa.';
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <AnimatedCard style={styles.result}>
            <BrandMark size={56} />
            {outcome === 'queued' || !outcome ? (
              <AppIcon name={{ ios: 'info.circle.fill', android: 'info' }} color={theme.warning} size={44} />
            ) : (
              <LottieAnimation source={successAnimation} size={96} loop={false} accessibilityLabel="Toma registrada correctamente" />
            )}
            <ThemedText type="title" style={styles.resultTitle}>{outcome === 'queued' ? 'Alarma detenida' : 'Toma revisada'}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centerText}>{message}</ThemedText>
            <ActionButton label="Volver a inicio" onPress={() => router.replace('/')} size="large" />
          </AnimatedCard>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
          <View style={[styles.alarmHero, { backgroundColor: theme.hero, borderColor: theme.border }]}>
            <View style={styles.heroTop}>
              <View style={[styles.heroBadge, { backgroundColor: `${theme.heroText}1C` }]}>
                <AppIcon name={{ ios: 'bell.badge.fill', android: 'notifications_active' }} color={theme.heroText} size={14} />
                <ThemedText type="smallBold" style={[styles.heroBadgeText, { color: theme.heroText }]}>ALARMA DE MEDICAMENTO</ThemedText>
              </View>
              <AlarmVisual size={92} />
            </View>

            <View style={styles.timeBlock}>
              <ThemedText style={[styles.timeLabel, { color: theme.heroMuted }]}>Hora programada</ThemedText>
              <ThemedText type="title" style={[styles.timeValue, { color: theme.heroText }]}>{scheduledAt}</ThemedText>
              {scheduledDate ? <ThemedText type="small" style={{ color: theme.heroMuted }}>{scheduledDate}</ThemedText> : null}
            </View>

            <View style={[styles.medicationRow, { borderTopColor: `${theme.heroText}22` }]}>
              <View style={[styles.photoFrame, { backgroundColor: `${theme.heroText}1C` }]}>
                <MedicationPhotoThumbnail photoPath={photoPath} size={84} />
              </View>
              <View style={styles.medicationCopy}>
                <ThemedText type="subtitle" numberOfLines={2} style={[styles.medicationName, { color: theme.heroText }]}>{title}</ThemedText>
                <ThemedText style={{ color: theme.heroMuted }}>{dose}</ThemedText>
              </View>
            </View>
          </View>

          <SurfaceCard style={styles.actionCard}>
            {error ? <ThemedText type="small" style={{ color: theme.danger, textAlign: 'center' }}>{error}</ThemedText> : null}
            <ActionButton
              label="Cancelar alarma y registrar toma"
              onPress={() => void handleConfirm()}
              loading={isBusy}
              disabled={!occurrenceId}
              size="large"
              icon={{ ios: 'checkmark.circle.fill', android: 'check_circle' }}
            />
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
  content: { flexGrow: 1, gap: Spacing.three, justifyContent: 'center', padding: Spacing.four },
  alarmHero: { borderRadius: Radius.xl, borderWidth: 1, gap: Spacing.three, overflow: 'hidden', padding: Spacing.three },
  heroTop: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  heroBadge: { alignItems: 'center', borderRadius: Radius.pill, flexDirection: 'row', flexShrink: 1, gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  heroBadgeText: { flexShrink: 1, fontSize: 11, letterSpacing: 0.5, lineHeight: 15 },
  timeBlock: { alignItems: 'center', gap: 2, paddingVertical: Spacing.two },
  timeLabel: { fontSize: 13, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  timeValue: { fontSize: 58, lineHeight: 66, fontVariant: ['tabular-nums'], letterSpacing: -1.4 },
  medicationRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: Spacing.three, paddingTop: Spacing.three },
  photoFrame: { borderRadius: Radius.lg, padding: 6 },
  medicationCopy: { flex: 1, gap: 4, minWidth: 0 },
  medicationName: { fontSize: 24, lineHeight: 29 },
  actionCard: { alignItems: 'stretch', gap: Spacing.two },
  hint: { textAlign: 'center' },
  result: { alignItems: 'center', flex: 1, gap: Spacing.three, justifyContent: 'center', padding: Spacing.four },
  resultTitle: { textAlign: 'center' },
  centerText: { maxWidth: 330, textAlign: 'center' },
});
