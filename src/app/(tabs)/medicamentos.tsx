import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/form-controls';
import emptyAnimation from '@/assets/animations/medirecord-empty.json';
import loadingAnimation from '@/assets/animations/medirecord-loading.json';
import { LottieAnimation } from '@/components/lottie-animation';
import { MedicationCard } from '@/components/medication-card';
import { AppIcon, AnimatedCard, EmptyState, SectionLabel } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { archiveMedication, fetchMedicationCatalog, restoreMedication } from '@/lib/medications';
import { reconcileMedicationAlarms } from '@/lib/medication-alarm-reconciler';
import { useAuth } from '@/providers/auth-provider';
import type { Medication, MedicationCatalog } from '@/types/medications';

type MedicationFilter = 'active' | 'archived';
type LoadState = { userId: string; catalog: MedicationCatalog | null; error: string | null };
type ActionState = { medicationId: string; action: 'archive' | 'restore' } | null;

function FilterButton({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.filterButton, { backgroundColor: selected ? theme.primary : 'transparent' }]}>
      <ThemedText type="smallBold" style={{ color: selected ? '#FFFFFF' : theme.textSecondary }}>{label}</ThemedText>
    </Pressable>
  );
}

function Header({ filter, onFilterChange, onRetry, isError, actionError }: { filter: MedicationFilter; onFilterChange: (filter: MedicationFilter) => void; onRetry: () => void; isError: boolean; actionError: string | null }) {
  const theme = useTheme();
  return (
    <View style={styles.headerContent}>
      <AnimatedCard delay={40}>
        <View style={styles.pageHeader}>
          <View style={styles.titleCopy}>
            <SectionLabel>Tu tratamiento</SectionLabel>
            <ThemedText type="title" style={styles.title}>Medicamentos</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.description}>Consulta tus tratamientos y horarios en un solo lugar.</ThemedText>
          </View>
          <View style={[styles.headerIcon, { backgroundColor: theme.primarySoft }]}><AppIcon name={{ ios: 'pills.fill', android: 'medication' }} color={theme.primary} size={28} /></View>
        </View>
      </AnimatedCard>

      <View style={[styles.filter, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <FilterButton label="Activos" selected={filter === 'active'} onPress={() => onFilterChange('active')} />
        <FilterButton label="Archivados" selected={filter === 'archived'} onPress={() => onFilterChange('archived')} />
      </View>

      <Link href="/medicamentos/nuevo" asChild>
        <Pressable accessibilityRole="button" style={({ pressed }) => [styles.addButton, { backgroundColor: theme.primary, borderColor: theme.primary, opacity: pressed ? 0.86 : 1 }]}>
          <View style={[styles.addIcon, { backgroundColor: '#FFFFFF22' }]}>
            <AppIcon name={{ ios: 'plus', android: 'add' }} color="#FFFFFF" size={22} />
          </View>
          <View style={styles.addCopy}><ThemedText type="smallBold" style={styles.addLabel}>Agregar medicamento</ThemedText><ThemedText type="small" style={styles.addHint}>Registra un nuevo tratamiento</ThemedText></View>
          <AppIcon name={{ ios: 'chevron.right', android: 'chevron_right' }} color="#FFFFFF" size={19} />
        </Pressable>
      </Link>

      {isError ? (
        <View style={[styles.errorCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <AppIcon name={{ ios: 'exclamationmark.triangle', android: 'warning' }} color={theme.danger} size={23} />
          <View style={styles.errorCopy}><ThemedText type="smallBold">No pudimos cargar los medicamentos.</ThemedText><ThemedText type="small" themeColor="textSecondary">Comprueba tu conexión e inténtalo de nuevo.</ThemedText></View>
          <ActionButton label="Reintentar" onPress={onRetry} tone="neutral" />
        </View>
      ) : null}
      {actionError ? (
        <View style={[styles.errorCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <AppIcon name={{ ios: 'exclamationmark.triangle', android: 'warning' }} color={theme.danger} size={23} />
          <View style={styles.errorCopy}><ThemedText type="smallBold">No pudimos completar la operación.</ThemedText><ThemedText type="small" themeColor="textSecondary">{actionError}</ThemedText></View>
        </View>
      ) : null}
    </View>
  );
}

export default function MedicamentosScreen() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<MedicationFilter>('active');
  const [loadState, setLoadState] = useState<LoadState | null>(null);
  const [actionState, setActionState] = useState<ActionState>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const userId = user?.id ?? null;
  const state = userId && loadState?.userId === userId ? loadState : null;
  const isLoading = Boolean(userId && !state);

  const loadCatalog = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    try {
      const catalog = await fetchMedicationCatalog(userId);
      setLoadState({ userId, catalog, error: null });
      return true;
    } catch (error) {
      setLoadState({ userId, catalog: null, error: error instanceof Error ? error.message : 'No pudimos cargar los medicamentos.' });
      return false;
    }
  }, [userId]);

  useFocusEffect(useCallback(() => {
    void loadCatalog();
  }, [loadCatalog]));

  const medications = useMemo<Medication[]>(() => {
    if (!state?.catalog) return [];
    return filter === 'active' ? state.catalog.active : state.catalog.archived;
  }, [filter, state?.catalog]);

  function retry() {
    setLoadState(null);
    void loadCatalog();
  }

  function requestArchive(medication: Medication) {
    if (actionState) return;
    Alert.alert(
      'Archivar medicamento',
      `¿Quieres archivar ${medication.name}? Dejará de aparecer entre tus medicamentos activos y sus tomas futuras se omitirán. El historial se conservará.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Archivar', style: 'destructive', onPress: () => void executeArchive(medication) },
      ]
    );
  }

  async function executeArchive(medication: Medication) {
    if (actionState) return;
    setActionError(null);
    setActionState({ medicationId: medication.id, action: 'archive' });
    try {
      const result = await archiveMedication(medication.id, true);
      const refreshed = await loadCatalog();
      if (!refreshed) throw new Error('El medicamento se archivó, pero no pudimos actualizar el listado. Inténtalo de nuevo.');
      await reconcileMedicationAlarms();
      const skippedMessage = result.skippedFuture > 0
        ? ` Se omitieron ${result.skippedFuture} tomas futuras pendientes.`
        : '';
      Alert.alert('Medicamento archivado', `El medicamento ya no aparece como activo y su historial se conservó.${skippedMessage}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos archivar el medicamento. Inténtalo de nuevo.');
    } finally {
      setActionState(null);
    }
  }

  function requestRestore(medication: Medication) {
    if (actionState) return;
    Alert.alert(
      'Restaurar medicamento',
      `¿Quieres restaurar ${medication.name}? El medicamento volverá a estar activo, pero sus horarios anteriores no se reactivarán automáticamente.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Restaurar', onPress: () => void executeRestore(medication) },
      ]
    );
  }

  async function executeRestore(medication: Medication) {
    if (actionState) return;
    setActionError(null);
    setActionState({ medicationId: medication.id, action: 'restore' });
    try {
      const result = await restoreMedication(medication.id);
      const refreshed = await loadCatalog();
      if (!refreshed) throw new Error('El medicamento se restauró, pero no pudimos actualizar el listado. Inténtalo de nuevo.');
      await reconcileMedicationAlarms();
      const message = result.requiresNewSchedule
        ? 'El medicamento se restauró, pero sus horarios anteriores no se reactivaron. Debes configurar un nuevo horario.'
        : 'El medicamento se restauró correctamente.';
      Alert.alert('Medicamento restaurado', message);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos restaurar el medicamento. Inténtalo de nuevo.');
    } finally {
      setActionState(null);
    }
  }

  const header = <Header filter={filter} onFilterChange={setFilter} onRetry={retry} isError={Boolean(state?.error)} actionError={actionError} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {isLoading ? (
          <View style={styles.loading}><LottieAnimation source={loadingAnimation} size={68} accessibilityLabel="Cargando medicamentos" /><ThemedText type="small" themeColor="textSecondary">Cargando medicamentos…</ThemedText></View>
        ) : state?.error ? (
          <FlatList<Medication> data={[]} renderItem={() => null} ListHeaderComponent={header} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} />
        ) : (
          <FlatList
            data={medications}
            keyExtractor={(item) => item.id}
             renderItem={({ item, index }) => <AnimatedCard delay={index * 45}><MedicationCard medication={item} onArchive={filter === 'active' ? requestArchive : undefined} onRestore={filter === 'archived' ? requestRestore : undefined} actionLoading={actionState?.medicationId === item.id} /></AnimatedCard>}
            ListHeaderComponent={header}
             ListEmptyComponent={<EmptyState icon={{ ios: filter === 'active' ? 'pills' : 'archivebox', android: filter === 'active' ? 'medication' : 'inventory_2' }} animation={{ source: emptyAnimation, accessibilityLabel: 'Ilustración animada de medicamentos' }} title={filter === 'active' ? 'No tienes medicamentos activos' : 'No tienes medicamentos archivados'} body={filter === 'active' ? 'Cuando registres un tratamiento aparecerá aquí.' : 'Los medicamentos que archives aparecerán en esta sección.'} />}
            contentContainerStyle={[styles.content, medications.length === 0 && styles.emptyContent]}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { alignSelf: 'center', gap: Spacing.three, maxWidth: MaxContentWidth, paddingBottom: BottomTabInset + Spacing.five, paddingHorizontal: Spacing.four, paddingTop: Spacing.two, width: '100%' },
  emptyContent: { flexGrow: 1 },
  headerContent: { gap: Spacing.three },
  pageHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.three, justifyContent: 'space-between' },
  titleCopy: { flex: 1, gap: 5 },
  title: { fontSize: 34, lineHeight: 39 },
  description: { lineHeight: 22 },
  headerIcon: { alignItems: 'center', borderRadius: 20, height: 64, justifyContent: 'center', width: 64 },
  filter: { borderRadius: 16, borderWidth: 1, flexDirection: 'row', padding: 4 },
  filterButton: { alignItems: 'center', borderRadius: 12, flex: 1, minHeight: 42, justifyContent: 'center', paddingHorizontal: 8 },
  addButton: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 68, paddingHorizontal: 14 },
  addIcon: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  addCopy: { flex: 1, gap: 2 },
  addLabel: { color: '#FFFFFF' },
  addHint: { color: '#DDF4F0' },
  errorCard: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 14 },
  errorCopy: { flex: 1, gap: 2 },
  loading: { alignItems: 'center', flex: 1, gap: Spacing.three, justifyContent: 'center' },
});
