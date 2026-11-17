import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/form-controls';
import emptyAnimation from '@/assets/animations/medirecord-empty.json';
import loadingAnimation from '@/assets/animations/medirecord-loading.json';
import { LottieAnimation } from '@/components/lottie-animation';
import { MedicationSummaryHeader } from '@/components/medication-summary';
import { AppIcon, AnimatedCard, BrandMark, EmptyState, QuickAction, SectionLabel, StatusPill, SurfaceCard, type AppIconName } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { fetchHomeSummary, getLocalDate, type HomeOccurrence, type HomeSummary } from '@/lib/home';

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function occurrenceStatus(occurrence: HomeOccurrence): { label: string; tone: 'success' | 'warning' | 'neutral' } {
  if (occurrence.status === 'taken') return { label: 'Tomada', tone: 'success' };
  if (occurrence.isOverdue) return { label: 'Atrasada', tone: 'warning' };
  return { label: 'Pendiente', tone: 'neutral' };
}

function formatLocalDate(dateValue: string): string {
  const [year, month, day] = dateValue.split('-').map(Number);
  if (!year || !month || !day) return dateValue;
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', weekday: 'short' })
    .format(new Date(year, month - 1, day))
    .replace('.', '');
}

function StatTile({ icon, value, label, color, delay }: { icon: AppIconName; value: number; label: string; color: string; delay: number }) {
  return (
    <AnimatedCard delay={delay} style={styles.statColumn}>
      <SurfaceCard style={styles.statCard}>
        <View style={[styles.statIcon, { backgroundColor: `${color}18` }]}>
          <AppIcon name={icon} color={color} size={20} />
        </View>
        <View style={styles.statCopy}>
          <ThemedText type="title" style={[styles.statNumber, { color }]}>{value}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
        </View>
      </SurfaceCard>
    </AnimatedCard>
  );
}

function MedicationSummaryCard({ medication, first }: { medication: HomeSummary['medications'][number]; first: boolean }) {
  const theme = useTheme();
  const next = medication.nextOccurrence;
  const status = next ? occurrenceStatus(next) : null;

  return (
    <View style={[styles.medicationSummaryItem, !first && { borderTopColor: theme.border, borderTopWidth: 1 }]}>
      <MedicationSummaryHeader
        photoPath={medication.photoPath}
        name={medication.name}
        doseAmount={medication.doseAmount}
        doseForm={medication.doseForm}
        schedules={medication.schedules}
        photoSize={54}
        compact
      />
      {next && status ? (
        <View style={[styles.nextMedicationRow, { backgroundColor: next.isOverdue ? `${theme.warning}12` : theme.background }]}>
          <View style={styles.nextMedicationCopy}>
            <ThemedText type="small" themeColor="textSecondary">{next.isOverdue ? 'Toma atrasada' : 'Próxima toma'}</ThemedText>
            <ThemedText type="smallBold">{next.localTime.slice(0, 5)} · {formatLocalDate(next.localDate)}</ThemedText>
          </View>
          <StatusPill label={status.label} tone={status.tone} compact />
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.noNextDose}>No hay próximas tomas registradas.</ThemedText>
      )}
    </View>
  );
}

function UpcomingOccurrenceRow({ occurrence, highlighted = false }: { occurrence: HomeOccurrence; highlighted?: boolean }) {
  const theme = useTheme();
  const status = occurrenceStatus(occurrence);
  const accent = occurrence.isOverdue ? theme.warning : theme.primary;

  return (
    <View
      style={[
        styles.occurrenceRow,
        highlighted
          ? [styles.occurrenceRowHighlighted, { backgroundColor: occurrence.isOverdue ? `${theme.warning}12` : theme.background, borderColor: occurrence.isOverdue ? `${theme.warning}40` : theme.border }]
          : { borderTopColor: theme.border },
      ]}>
      <View style={[styles.occurrenceIcon, highlighted && styles.occurrenceIconLarge, { backgroundColor: occurrence.isOverdue ? `${theme.warning}20` : theme.primarySoft }]}>
        <AppIcon
          name={{ ios: occurrence.isOverdue ? 'exclamationmark.triangle' : 'clock.fill', android: occurrence.isOverdue ? 'history' : 'schedule' }}
          color={accent}
          size={highlighted ? 22 : 19}
        />
      </View>
      <View style={styles.occurrenceCopy}>
        <ThemedText type="smallBold" numberOfLines={1}>{occurrence.medicationName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {highlighted ? formatLocalDate(occurrence.localDate) : `${occurrence.localTime.slice(0, 5)} · ${formatLocalDate(occurrence.localDate)}`}
        </ThemedText>
      </View>
      <View style={styles.occurrenceRight}>
        {highlighted ? (
          <ThemedText type="subtitle" style={[styles.occurrenceTime, { color: accent }]}>
            {occurrence.localTime.slice(0, 5)}
          </ThemedText>
        ) : null}
        <StatusPill label={status.label} tone={status.tone} compact />
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const theme = useTheme();
  const timezone = profile?.timezone;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || 'de nuevo';
  // Se recalcula en cada render para que el encabezado cambie de fecha al volver al Home.
  const today = capitalize(new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(new Date()));
  const [loadState, setLoadState] = useState<{ userId: string; summary: HomeSummary | null; error: string | null } | null>(null);
  const userId = user?.id ?? null;
  const state = userId && loadState?.userId === userId ? loadState : null;
  const isLoading = Boolean(userId && !state);

  const loadHome = useCallback(async () => {
    if (!userId) return;
    try {
      const summary = await fetchHomeSummary(userId, timezone);
      setLoadState({ userId, summary, error: null });
    } catch (error) {
      setLoadState({
        userId,
        summary: null,
        error: error instanceof Error ? error.message : 'No pudimos cargar el resumen de tu tratamiento.',
      });
    }
  }, [timezone, userId]);

  useFocusEffect(useCallback(() => {
    void loadHome();
  }, [loadHome]));

  // Si el día local cambia con la pantalla montada (por ejemplo, al reabrir la app
  // después de medianoche), se recarga la agenda automáticamente.
  useEffect(() => {
    let currentDate = getLocalDate(timezone);
    const interval = setInterval(() => {
      const nextDate = getLocalDate(timezone);
      if (nextDate !== currentDate) {
        currentDate = nextDate;
        void loadHome();
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [loadHome, timezone]);

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <LottieAnimation source={loadingAnimation} size={68} accessibilityLabel="Cargando el resumen" />
        <ThemedText type="small" themeColor="textSecondary">Cargando tu resumen…</ThemedText>
      </ThemedView>
    );
  }

  if (!userId || state?.error || !state?.summary) {
    return (
      <ThemedView style={styles.centered}>
        <AppIcon name={{ ios: 'exclamationmark.triangle', android: 'warning' }} color={theme.danger} size={34} />
        <ThemedText type="smallBold" style={styles.centeredText}>{state?.error ?? 'Tu sesión no está disponible.'}</ThemedText>
        <ActionButton label="Reintentar" onPress={() => void loadHome()} tone="neutral" />
      </ThemedView>
    );
  }

  const { summary } = state;
  const featuredOccurrence = summary.upcomingOccurrences[0] ?? null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <BrandMark size={44} />
              <View>
                <ThemedText type="smallBold" style={styles.brandName}>MediRecord</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">Tu salud, en orden</ThemedText>
              </View>
            </View>
            <Link href="/perfil" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil" style={({ pressed }) => [styles.avatarButton, { backgroundColor: theme.primary, opacity: pressed ? 0.82 : 1 }]}>
                <ThemedText type="smallBold" style={[styles.avatarText, { color: theme.onPrimary }]}>{firstName.charAt(0).toUpperCase()}</ThemedText>
              </Pressable>
            </Link>
          </View>

          <AnimatedCard delay={40}>
            <View style={styles.greeting}>
              <ThemedText type="small" themeColor="textSecondary">{today}</ThemedText>
              <ThemedText type="title">Hola, {firstName}</ThemedText>
              <ThemedText themeColor="textSecondary">Aquí tienes una vista clara de tu rutina de medicación.</ThemedText>
            </View>
          </AnimatedCard>

          <AnimatedCard delay={90}>
            <View style={[styles.heroCard, { backgroundColor: theme.hero }]}>
              <View style={styles.heroCopy}>
                <View style={[styles.heroBadge, { backgroundColor: `${theme.heroText}1C` }]}>
                  <View style={[styles.heroBadgeDot, { backgroundColor: theme.heroText }]} />
                  <ThemedText type="smallBold" style={{ color: theme.heroText }}>Todo bajo control</ThemedText>
                </View>
                <ThemedText type="subtitle" style={[styles.heroTitle, { color: theme.heroText }]}>
                  {summary.medications.length > 0 ? 'Tu día empieza aquí.' : 'Organiza tu tratamiento.'}
                </ThemedText>
                <ThemedText style={[styles.heroBody, { color: theme.heroMuted }]}>
                  {summary.medications.length > 0
                    ? `${summary.medications.length} ${summary.medications.length === 1 ? 'medicamento activo' : 'medicamentos activos'} y ${summary.counts.pending + summary.counts.overdue} ${summary.counts.pending + summary.counts.overdue === 1 ? 'toma por delante' : 'tomas por delante'}.`
                    : 'Registra tus medicamentos para organizar tus próximas tomas.'}
                </ThemedText>
              </View>
              <View style={[styles.heroIcon, { backgroundColor: `${theme.heroText}1C` }]}>
                <AppIcon name={{ ios: 'heart.text.square.fill', android: 'health_and_safety' }} color={theme.heroText} size={32} />
              </View>
            </View>
          </AnimatedCard>

          <View style={styles.sectionHeader}>
            <SectionLabel>Resumen de hoy</SectionLabel>
            <ThemedText type="small" themeColor="textSecondary">{summary.medications.length} activos</ThemedText>
          </View>
          <View style={styles.statsRow}>
            <StatTile icon={{ ios: 'pills.fill', android: 'medication' }} value={summary.medications.length} label="Activos" color={theme.primary} delay={130} />
            <StatTile icon={{ ios: 'clock.fill', android: 'schedule' }} value={summary.counts.pending} label="Pendientes" color={theme.secondary} delay={160} />
          </View>
          <View style={styles.statsRow}>
            <StatTile icon={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} value={summary.counts.taken} label="Tomadas hoy" color={theme.success} delay={190} />
            <StatTile icon={{ ios: 'exclamationmark.triangle.fill', android: 'warning' }} value={summary.counts.overdue} label="Atrasadas" color={theme.warning} delay={220} />
          </View>

          <AnimatedCard delay={250}>
            <SurfaceCard>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderCopy}>
                  <SectionLabel>Próximas tomas</SectionLabel>
                  <ThemedText type="subtitle" style={styles.cardTitle}>Tu agenda</ThemedText>
                </View>
                <StatusPill label={summary.counts.pending > 0 ? `${summary.counts.pending} pendientes` : 'Sin pendientes'} tone="neutral" compact />
              </View>
              <View style={styles.statusRow}>
                <View style={styles.statusItem}>
                  <ThemedText type="title" style={[styles.statusNumber, { color: theme.secondary }]}>{summary.counts.pending}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">Pendientes</ThemedText>
                </View>
                <View style={[styles.statusDivider, { backgroundColor: theme.border }]} />
                <View style={styles.statusItem}>
                  <ThemedText type="title" style={[styles.statusNumber, { color: theme.success }]}>{summary.counts.taken}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">Tomadas</ThemedText>
                </View>
                <View style={[styles.statusDivider, { backgroundColor: theme.border }]} />
                <View style={styles.statusItem}>
                  <ThemedText type="title" style={[styles.statusNumber, { color: theme.warning }]}>{summary.counts.overdue}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">Atrasadas</ThemedText>
                </View>
              </View>
              {summary.upcomingOccurrences.length > 0 ? (
                <View style={styles.occurrenceList}>
                  {featuredOccurrence ? <UpcomingOccurrenceRow occurrence={featuredOccurrence} highlighted /> : null}
                  {summary.upcomingOccurrences.slice(1).map((occurrence) => <UpcomingOccurrenceRow key={occurrence.id} occurrence={occurrence} />)}
                </View>
              ) : (
                <EmptyState icon={{ ios: 'calendar.badge.clock', android: 'event_available' }} animation={{ source: emptyAnimation, accessibilityLabel: 'Ilustración animada de agenda vacía' }} title="Todavía no hay tomas pendientes" body={summary.medications.length > 0 ? 'Tus próximas tomas aparecerán aquí cuando estén sincronizadas.' : 'Cuando agregues un medicamento, tus horarios aparecerán aquí.'} />
              )}
            </SurfaceCard>
          </AnimatedCard>

          <AnimatedCard delay={290}>
            <SurfaceCard>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderCopy}>
                  <SectionLabel>Tratamiento</SectionLabel>
                  <ThemedText type="subtitle" style={styles.cardTitle}>Medicamentos</ThemedText>
                </View>
                <View style={[styles.cardHeaderIcon, { backgroundColor: theme.primarySoft }]}>
                  <AppIcon name={{ ios: 'pills', android: 'medication_liquid' }} color={theme.primary} size={22} />
                </View>
              </View>
              {summary.medications.length > 0 ? (
                <View style={styles.medicationSummaryList}>
                  {summary.medications.map((medication, index) => (
                    <MedicationSummaryCard key={medication.id} medication={medication} first={index === 0} />
                  ))}
                </View>
              ) : (
                <EmptyState icon={{ ios: 'cross.case', android: 'medication' }} title="Tu lista está vacía" body="Aún no hay medicamentos para mostrar. Registra un tratamiento desde Medicamentos." />
              )}
            </SurfaceCard>
          </AnimatedCard>

          <View style={styles.sectionHeader}><SectionLabel>Accesos rápidos</SectionLabel></View>
          <AnimatedCard delay={330} style={styles.actionsGroup}>
            <Link href="/perfil" asChild>
              <QuickAction icon={{ ios: 'person.crop.circle', android: 'account_circle' }} label="Mi perfil" hint="Nombre y preferencias" />
            </Link>
            <Link href="/perfil" asChild>
              <QuickAction icon={{ ios: 'location.fill', android: 'public' }} label="Zona horaria" hint="Ajusta tu fecha local" />
            </Link>
          </AnimatedCard>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  centered: { alignItems: 'center', flex: 1, gap: Spacing.three, justifyContent: 'center', padding: Spacing.four },
  centeredText: { maxWidth: 320, textAlign: 'center' },
  content: { alignSelf: 'center', gap: Spacing.three, maxWidth: MaxContentWidth, paddingHorizontal: Spacing.four, paddingBottom: BottomTabInset + Spacing.five, paddingTop: Spacing.two, width: '100%' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  brandRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  brandName: { fontSize: 16 },
  avatarButton: { alignItems: 'center', borderRadius: Radius.pill, height: 42, justifyContent: 'center', width: 42 },
  avatarText: { fontSize: 17 },
  greeting: { gap: 5, paddingTop: Spacing.two },
  heroCard: { borderRadius: Radius.lg, flexDirection: 'row', gap: Spacing.three, justifyContent: 'space-between', minHeight: 176, overflow: 'hidden', padding: Spacing.four },
  heroCopy: { flex: 1, gap: 10, minWidth: 0 },
  heroBadge: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: Radius.pill, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  heroBadgeDot: { borderRadius: Radius.pill, height: 6, width: 6 },
  heroTitle: { fontSize: 25, lineHeight: 31 },
  heroBody: { lineHeight: 21 },
  heroIcon: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: Radius.lg, height: 58, justifyContent: 'center', width: 58 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.two },
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  statColumn: { flex: 1 },
  statCard: { gap: 10, minHeight: 118 },
  statIcon: { alignItems: 'center', borderRadius: Radius.sm, height: 38, justifyContent: 'center', width: 38 },
  statCopy: { gap: 1 },
  statNumber: { fontSize: 28, lineHeight: 32 },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  cardHeaderCopy: { flex: 1, gap: 2, minWidth: 0 },
  cardHeaderIcon: { alignItems: 'center', borderRadius: Radius.sm, height: 40, justifyContent: 'center', width: 40 },
  cardTitle: { fontSize: 22, lineHeight: 28, marginTop: 2 },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between', paddingTop: Spacing.three },
  statusItem: { alignItems: 'center', flex: 1, gap: 1, minWidth: 0 },
  statusNumber: { fontSize: 25, lineHeight: 30 },
  statusDivider: { height: 34, width: 1 },
  occurrenceList: { gap: Spacing.two, marginTop: Spacing.three },
  occurrenceRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 10, minHeight: 62, paddingTop: 10 },
  occurrenceRowHighlighted: { borderTopWidth: 0, borderRadius: Radius.md, borderWidth: 1, minHeight: 74, padding: 12 },
  occurrenceIcon: { alignItems: 'center', borderRadius: Radius.sm, height: 38, justifyContent: 'center', width: 38 },
  occurrenceIconLarge: { height: 44, width: 44 },
  occurrenceCopy: { flex: 1, gap: 2, minWidth: 0 },
  occurrenceRight: { alignItems: 'flex-end', gap: 4 },
  occurrenceTime: { fontSize: 23, lineHeight: 27 },
  medicationSummaryList: { marginTop: Spacing.one },
  medicationSummaryItem: { gap: Spacing.two, paddingVertical: Spacing.three },
  nextMedicationRow: { alignItems: 'center', borderRadius: Radius.sm, flexDirection: 'row', gap: 10, minHeight: 50, paddingHorizontal: 11 },
  nextMedicationCopy: { flex: 1, gap: 1, minWidth: 0 },
  noNextDose: { paddingBottom: 2 },
  actionsGroup: { gap: Spacing.two },
});
