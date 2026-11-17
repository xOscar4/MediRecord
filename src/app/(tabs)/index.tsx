import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/form-controls';
import emptyAnimation from '@/assets/animations/medirecord-empty.json';
import loadingAnimation from '@/assets/animations/medirecord-loading.json';
import { LottieAnimation } from '@/components/lottie-animation';
import { MedicationPhotoThumbnail } from '@/components/medication-photo-section';
import { AppIcon, AnimatedCard, BrandMark, EmptyState, QuickAction, SectionLabel, StatusPill, SurfaceCard } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { fetchHomeSummary, type HomeOccurrence, type HomeSummary } from '@/lib/home';

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

function MedicationSummaryCard({ medication }: { medication: HomeSummary['medications'][number] }) {
  const theme = useTheme();
  const next = medication.nextOccurrence;
  const status = next ? occurrenceStatus(next) : null;

  return (
    <SurfaceCard style={styles.medicationSummaryCard}>
      <View style={styles.medicationSummaryHeader}>
         <MedicationPhotoThumbnail photoPath={medication.photoPath} size={44} />
        <View style={styles.medicationSummaryCopy}>
          <ThemedText type="subtitle" numberOfLines={1} style={styles.medicationName}>{medication.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{medication.doseAmount || 'Dosis no indicada'}</ThemedText>
        </View>
      </View>
      {next && status ? (
        <View style={[styles.nextMedicationRow, { backgroundColor: theme.background }]}>
          <View style={styles.nextMedicationCopy}>
            <ThemedText type="small" themeColor="textSecondary">{next.isOverdue ? 'Toma atrasada' : 'Próxima toma'}</ThemedText>
            <ThemedText type="smallBold">{next.localTime.slice(0, 5)} · {formatLocalDate(next.localDate)}</ThemedText>
          </View>
          <StatusPill label={status.label} tone={status.tone} compact />
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">No hay próximas tomas registradas.</ThemedText>
      )}
    </SurfaceCard>
  );
}

function UpcomingOccurrenceRow({ occurrence }: { occurrence: HomeOccurrence }) {
  const theme = useTheme();
  const status = occurrenceStatus(occurrence);

  return (
    <View style={[styles.occurrenceRow, { borderTopColor: theme.border }]}>
      <View style={[styles.occurrenceIcon, { backgroundColor: occurrence.isOverdue ? `${theme.warning}20` : theme.primarySoft }]}>
        <AppIcon name={{ ios: occurrence.isOverdue ? 'exclamationmark.triangle' : 'clock.fill', android: occurrence.isOverdue ? 'history' : 'schedule' }} color={occurrence.isOverdue ? theme.warning : theme.primary} size={19} />
      </View>
      <View style={styles.occurrenceCopy}>
        <ThemedText type="smallBold" numberOfLines={1}>{occurrence.medicationName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{occurrence.localTime.slice(0, 5)} · {formatLocalDate(occurrence.localDate)}</ThemedText>
      </View>
      <StatusPill label={status.label} tone={status.tone} compact />
    </View>
  );
}

export default function HomeScreen() {
  const { user, profile } = useAuth();
  const theme = useTheme();
  const timezone = profile?.timezone;
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || user?.email?.split('@')[0] || 'de nuevo';
  const today = useMemo(
    () => capitalize(new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(new Date())),
    [timezone]
  );
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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View style={styles.brandRow}>
              <BrandMark size={42} />
              <View>
                <ThemedText type="smallBold" style={styles.brandName}>MediRecord</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">Tu salud, en orden</ThemedText>
              </View>
            </View>
            <Link href="/perfil" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel="Abrir perfil" style={styles.avatarButton}>
                <ThemedText type="smallBold" style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</ThemedText>
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
            <View style={styles.heroCard}>
              <View style={styles.heroCopy}>
                <StatusPill label="Todo bajo control" tone="neutral" />
                 <ThemedText type="subtitle" style={styles.heroTitle}>{summary.medications.length > 0 ? 'Tu día empieza aquí.' : 'Organiza tu tratamiento.'}</ThemedText>
                 <ThemedText style={styles.heroBody}>{summary.medications.length > 0 ? 'Consulta tus medicamentos y las próximas tomas programadas.' : 'Registra tus medicamentos para organizar tus próximas tomas.'}</ThemedText>
              </View>
              <View style={styles.heroIcon}><AppIcon name={{ ios: 'heart.text.square.fill', android: 'health_and_safety' }} color="#FFFFFF" size={34} /></View>
            </View>
          </AnimatedCard>

          <View style={styles.sectionHeader}>
            <SectionLabel>Resumen de hoy</SectionLabel>
             <ThemedText type="small" themeColor="textSecondary">{summary.medications.length} activos</ThemedText>
          </View>
          <View style={styles.statsRow}>
            <AnimatedCard delay={140} style={styles.statColumn}>
              <SurfaceCard style={styles.statCard}>
                 <View style={[styles.statIcon, { backgroundColor: theme.primarySoft }]}><AppIcon name={{ ios: 'pills.fill', android: 'medication' }} color={theme.primary} size={20} /></View>
                 <ThemedText type="title" style={styles.statNumber}>{summary.medications.length}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">Medicamentos activos</ThemedText>
              </SurfaceCard>
            </AnimatedCard>
            <AnimatedCard delay={180} style={styles.statColumn}>
              <SurfaceCard style={styles.statCard}>
                 <View style={[styles.statIcon, { backgroundColor: `${theme.accent}20` }]}><AppIcon name={{ ios: 'clock.fill', android: 'schedule' }} color={theme.accent} size={20} /></View>
                 <ThemedText type="title" style={styles.statNumber}>{summary.counts.pending + summary.counts.overdue}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">Próximas tomas</ThemedText>
              </SurfaceCard>
            </AnimatedCard>
          </View>

          <AnimatedCard delay={220}>
            <SurfaceCard>
              <View style={styles.cardHeader}>
                <View><SectionLabel>Próximas tomas</SectionLabel><ThemedText type="subtitle" style={styles.cardTitle}>Tu agenda</ThemedText></View>
                 <StatusPill label={summary.counts.pending > 0 ? `${summary.counts.pending} pendientes` : 'Sin pendientes'} tone="neutral" compact />
               </View>
               <View style={styles.statusRow}>
                  <View style={styles.statusItem}><ThemedText type="title" style={styles.statusNumber}>{summary.counts.pending}</ThemedText><StatusPill label="Pendientes" tone="neutral" compact style={styles.statusPill} /></View>
                  <View style={styles.statusItem}><ThemedText type="title" style={styles.statusNumber}>{summary.counts.taken}</ThemedText><StatusPill label="Tomadas" tone="success" compact style={styles.statusPill} /></View>
                  <View style={styles.statusItem}><ThemedText type="title" style={styles.statusNumber}>{summary.counts.overdue}</ThemedText><StatusPill label="Atrasadas" tone="warning" compact style={styles.statusPill} /></View>
               </View>
               {summary.upcomingOccurrences.length > 0 ? (
                 <View style={styles.occurrenceList}>
                   {summary.upcomingOccurrences.map((occurrence) => <UpcomingOccurrenceRow key={occurrence.id} occurrence={occurrence} />)}
                 </View>
               ) : (
                  <EmptyState icon={{ ios: 'calendar.badge.clock', android: 'event_available' }} animation={{ source: emptyAnimation, accessibilityLabel: 'Ilustración animada de agenda vacía' }} title="Todavía no hay tomas pendientes" body={summary.medications.length > 0 ? 'Tus próximas tomas aparecerán aquí cuando estén sincronizadas.' : 'Cuando agregues un medicamento, tus horarios aparecerán aquí.'} />
               )}
            </SurfaceCard>
          </AnimatedCard>

          <AnimatedCard delay={260}>
            <SurfaceCard>
              <View style={styles.cardHeader}>
                <View><SectionLabel>Tratamiento</SectionLabel><ThemedText type="subtitle" style={styles.cardTitle}>Medicamentos</ThemedText></View>
                <AppIcon name={{ ios: 'pills', android: 'medication_liquid' }} color="#60758A" size={24} />
              </View>
               {summary.medications.length > 0 ? (
                 <View style={styles.medicationSummaryList}>
                   {summary.medications.map((medication) => <MedicationSummaryCard key={medication.id} medication={medication} />)}
                 </View>
               ) : (
                 <EmptyState icon={{ ios: 'cross.case', android: 'medication' }} title="Tu lista está vacía" body="Aún no hay medicamentos para mostrar. Registra un tratamiento desde Medicamentos." />
               )}
            </SurfaceCard>
          </AnimatedCard>

          <View style={styles.sectionHeader}><SectionLabel>Accesos rápidos</SectionLabel></View>
          <AnimatedCard delay={300} style={styles.actionsGroup}>
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
  avatarButton: { alignItems: 'center', backgroundColor: '#0F766E', borderRadius: 99, height: 42, justifyContent: 'center', width: 42 },
  avatarText: { color: '#FFFFFF', fontSize: 17 },
  greeting: { gap: 5, paddingTop: Spacing.two },
  heroCard: { backgroundColor: '#0F766E', borderRadius: 24, flexDirection: 'row', justifyContent: 'space-between', minHeight: 178, overflow: 'hidden', padding: Spacing.four },
  heroCopy: { flex: 1, gap: 10, paddingRight: 12 },
  heroTitle: { color: '#FFFFFF', fontSize: 26, lineHeight: 31 },
  heroBody: { color: '#DDF4F0', lineHeight: 22 },
  heroIcon: { alignItems: 'center', backgroundColor: '#FFFFFF22', borderRadius: 22, height: 64, justifyContent: 'center', width: 64 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.two },
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  statColumn: { flex: 1 },
  statCard: { gap: 8, height: 145 },
  statIcon: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  statNumber: { fontSize: 30, lineHeight: 34 },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { fontSize: 23, lineHeight: 29, marginTop: 3 },
  statusRow: { alignItems: 'stretch', flexDirection: 'row', gap: Spacing.one, justifyContent: 'space-between', paddingBottom: Spacing.one, paddingTop: Spacing.two },
  statusItem: { alignItems: 'center', flex: 1, gap: Spacing.one, minWidth: 72, paddingHorizontal: 2 },
  statusNumber: { fontSize: 26, lineHeight: 32 },
  statusPill: { alignSelf: 'stretch', justifyContent: 'center', paddingHorizontal: 4 },
  occurrenceList: { gap: 4 },
  occurrenceRow: { alignItems: 'center', borderTopWidth: 1, flexDirection: 'row', gap: 10, minHeight: 64, paddingTop: 10 },
  occurrenceIcon: { alignItems: 'center', borderRadius: 11, height: 38, justifyContent: 'center', width: 38 },
  occurrenceCopy: { flex: 1, gap: 1, minWidth: 0 },
  medicationSummaryList: { gap: Spacing.two },
  medicationSummaryCard: { gap: Spacing.two, padding: Spacing.three },
  medicationSummaryHeader: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  medicationSummaryIcon: { alignItems: 'center', borderRadius: 13, height: 44, justifyContent: 'center', width: 44 },
  medicationSummaryCopy: { flex: 1, gap: 2, minWidth: 0 },
  medicationName: { fontSize: 20, lineHeight: 25 },
  nextMedicationRow: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 10, minHeight: 50, paddingHorizontal: 11 },
  nextMedicationCopy: { flex: 1, gap: 1, minWidth: 0 },
  actionsGroup: { gap: Spacing.two },
});
