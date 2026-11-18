import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ActionButton } from '@/components/form-controls';
import emptyAnimation from '@/assets/animations/medirecord-empty.json';
import { MedicationCard } from '@/components/medication-card';
import { AnimatedCard, AppIcon, EmptyState, LoadingState, PageHeader, SegmentedControl, SurfaceCard } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useMedicationArchive } from '@/hooks/use-medication-archive';
import { useTheme } from '@/hooks/use-theme';
import { deleteMedication, fetchMedicationCatalog, restoreMedication } from '@/lib/medications';
import { reconcileMedicationAlarms } from '@/lib/medication-alarm-reconciler';
import { useAuth } from '@/providers/auth-provider';
import type { Medication, MedicationCatalog } from '@/types/medications';

type MedicationFilter = 'active' | 'archived';
type LoadState = { userId: string; catalog: MedicationCatalog | null; error: string | null };

const FILTER_OPTIONS = [
  { value: 'active', label: 'Activos' },
  { value: 'archived', label: 'Archivados' },
] as const;

const SKELETON_IDS = ['med-skeleton-1', 'med-skeleton-2', 'med-skeleton-3'];

function Header({ filter, onFilterChange, onRetry, isError, actionError }: { filter: MedicationFilter; onFilterChange: (filter: MedicationFilter) => void; onRetry: () => void; isError: boolean; actionError: string | null }) {
  const theme = useTheme();
  const addButtonScale = useSharedValue(1);
  const addButtonAnimatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: addButtonScale.value }] }));

  return (
    <View style={styles.headerContent}>
      <AnimatedCard delay={40}>
        <PageHeader
          eyebrow="Tu tratamiento"
          title="Medicamentos"
          description="Consulta tus tratamientos y horarios en un solo lugar."
          icon={{ ios: 'pills.fill', android: 'medication' }}
        />
      </AnimatedCard>

      <SegmentedControl options={FILTER_OPTIONS} value={filter} onChange={onFilterChange} />

      <Link href="/medicamentos/nuevo" asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Agregar medicamento"
          onPressIn={() => { addButtonScale.set(withTiming(0.97, { duration: 110 })); }}
          onPressOut={() => { addButtonScale.set(withTiming(1, { duration: 160 })); }}
          style={styles.addButtonPressable}>
          <Animated.View
            style={[
              styles.addButton,
              { backgroundColor: theme.primary, boxShadow: theme.shadow },
              addButtonAnimatedStyle,
            ]}>
            <AppIcon name={{ ios: 'plus', android: 'add' }} color={theme.heroText} size={22} />
            <ThemedText type="smallBold" style={[styles.addButtonLabel, { color: theme.heroText }]}>
              Agregar medicamento
            </ThemedText>
          </Animated.View>
        </Pressable>
      </Link>

      {isError ? (
        <View style={[styles.errorCard, { backgroundColor: `${theme.danger}0D`, borderColor: `${theme.danger}33` }]}>
          <View style={styles.errorCopy}>
            <ThemedText type="smallBold">No pudimos cargar los medicamentos.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Comprueba tu conexión e inténtalo de nuevo.</ThemedText>
          </View>
          <ActionButton label="Reintentar" onPress={onRetry} tone="neutral" />
        </View>
      ) : null}
      {actionError ? (
        <View style={[styles.errorCard, { backgroundColor: `${theme.danger}0D`, borderColor: `${theme.danger}33` }]}>
          <View style={styles.errorCopy}>
            <ThemedText type="smallBold">No pudimos completar la operación.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">{actionError}</ThemedText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function MedicamentosScreen() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<MedicationFilter>('active');
  const [loadState, setLoadState] = useState<LoadState | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const restoringIdRef = useRef<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deletingIdRef = useRef<string | null>(null);
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

  const archive = useMedicationArchive({
    onArchived: async (result, medication) => {
      const refreshed = await loadCatalog();
      if (!refreshed) setActionError('El medicamento se archivó, pero no pudimos actualizar el listado. Inténtalo de nuevo.');
      const skippedMessage = result.skippedFuture > 0
        ? ` Se omitieron ${result.skippedFuture} tomas futuras pendientes.`
        : '';
      Alert.alert('Medicamento archivado', `${medication.name} ya no aparece como activo y su historial se conservó.${skippedMessage}`);
    },
  });

  useFocusEffect(useCallback(() => {
    void loadCatalog();
  }, [loadCatalog]));

  const medications = useMemo<Medication[]>(() => {
    if (!state?.catalog) return [];
    return filter === 'active' ? state.catalog.active : state.catalog.archived;
  }, [filter, state?.catalog]);

  const isBusy = Boolean(archive.pendingId) || restoringId !== null || deletingId !== null;

  function retry() {
    setLoadState(null);
    setActionError(null);
    archive.clearError();
    void loadCatalog();
  }

  function handleArchive(medication: Medication) {
    if (isBusy) return;
    setActionError(null);
    archive.requestArchive(medication);
  }

  function requestRestore(medication: Medication) {
    if (isBusy) return;
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
    if (!medication || restoringIdRef.current) return;
    restoringIdRef.current = medication.id;
    setActionError(null);
    setRestoringId(medication.id);
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
      restoringIdRef.current = null;
      setRestoringId(null);
    }
  }

  function requestDelete(medication: Medication) {
    if (isBusy || !medication.is_active) return;
    setActionError(null);
    Alert.alert(
      'Eliminar definitivamente',
      `¿Eliminar "${medication.name}"? Esta acción no se puede deshacer: se borrarían sus horarios y podría afectar los datos e historial asociados. Si tiene tomas registradas, la eliminación se bloqueará para proteger tu historial.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => void executeDelete(medication) },
      ]
    );
  }

  async function executeDelete(medication: Medication) {
    if (deletingIdRef.current || !medication.is_active) return;
    deletingIdRef.current = medication.id;
    setDeletingId(medication.id);
    setActionError(null);
    try {
      await deleteMedication(medication.id);
      const refreshed = await loadCatalog();
      if (!refreshed) throw new Error('El medicamento se eliminó, pero no pudimos actualizar el listado. Recarga la pantalla.');
      await reconcileMedicationAlarms();
      Alert.alert('Medicamento eliminado', `${medication.name} se eliminó definitivamente. No había historial de tomas que pudiera perderse.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No pudimos eliminar el medicamento. Inténtalo de nuevo.');
    } finally {
      deletingIdRef.current = null;
      setDeletingId(null);
    }
  }

  const header = (
    <Header
      filter={filter}
      onFilterChange={setFilter}
      onRetry={retry}
      isError={Boolean(state?.error)}
      actionError={actionError ?? archive.error}
    />
  );

  const listData: (Medication | string)[] = isLoading ? SKELETON_IDS : medications;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FlatList
          data={listData}
          keyExtractor={(item) => typeof item === 'string' ? item : item.id}
          renderItem={({ item, index }) => {
            if (typeof item === 'string') {
              return (
                <AnimatedCard delay={index * 60}>
                  <SurfaceCard><LoadingState label="Cargando medicamentos…" compact /></SurfaceCard>
                </AnimatedCard>
              );
            }
            return (
              <AnimatedCard delay={index * 45} exit>
                <MedicationCard
                  medication={item}
                  onArchive={filter === 'active' ? handleArchive : undefined}
                  onRestore={filter === 'archived' ? requestRestore : undefined}
                  onDelete={filter === 'archived' ? requestDelete : undefined}
                  actionLoading={archive.isPending(item.id) || restoringId === item.id || deletingId === item.id}
                />
              </AnimatedCard>
            );
          }}
          ListHeaderComponent={header}
          ListEmptyComponent={state?.error ? null : (
            <EmptyState
              icon={{ ios: filter === 'active' ? 'pills' : 'archivebox', android: filter === 'active' ? 'medication' : 'inventory_2' }}
              animation={{ source: emptyAnimation, accessibilityLabel: 'Ilustración animada de medicamentos' }}
              title={filter === 'active' ? 'No tienes medicamentos activos' : 'No tienes medicamentos archivados'}
              body={filter === 'active' ? 'Cuando registres un tratamiento aparecerá aquí.' : 'Los medicamentos que archives aparecerán en esta sección.'}
            />
          )}
          contentContainerStyle={[styles.content, medications.length === 0 && !isLoading && styles.emptyContent]}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { alignSelf: 'center', gap: Spacing.four, maxWidth: MaxContentWidth, paddingBottom: BottomTabInset + Spacing.five, paddingHorizontal: Spacing.four, paddingTop: Spacing.two, width: '100%' },
  emptyContent: { flexGrow: 1 },
  headerContent: { gap: Spacing.four },
  addButtonPressable: { width: '100%' },
  addButton: { alignItems: 'center', borderRadius: Radius.md, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 56, paddingHorizontal: Spacing.three, width: '100%' },
  addButtonLabel: { fontSize: 16, letterSpacing: 0.2 },
  errorCard: { borderRadius: Radius.md, borderWidth: 1, gap: Spacing.two, padding: 14 },
  errorCopy: { gap: 2 },
});
