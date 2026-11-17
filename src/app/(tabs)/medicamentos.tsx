import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ActionButton } from '@/components/form-controls';
import emptyAnimation from '@/assets/animations/medirecord-empty.json';
import loadingAnimation from '@/assets/animations/medirecord-loading.json';
import { LottieAnimation } from '@/components/lottie-animation';
import { MedicationCard } from '@/components/medication-card';
import { AppIcon, AnimatedCard, EmptyState, PageHeader, SegmentedControl } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { archiveMedication, fetchMedicationCatalog, restoreMedication } from '@/lib/medications';
import { reconcileMedicationAlarms } from '@/lib/medication-alarm-reconciler';
import { useAuth } from '@/providers/auth-provider';
import type { Medication, MedicationCatalog } from '@/types/medications';

type MedicationFilter = 'active' | 'archived';
type LoadState = { userId: string; catalog: MedicationCatalog | null; error: string | null };
type ActionState = { medicationId: string; action: 'archive' | 'restore' } | null;

const FILTER_OPTIONS = [
  { value: 'active', label: 'Activos' },
  { value: 'archived', label: 'Archivados' },
] as const;

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
          onPressIn={() => {
            addButtonScale.set(withTiming(0.97, { duration: 110 }));
          }}
          onPressOut={() => {
            addButtonScale.set(withTiming(1, { duration: 160 }));
          }}
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
  addButtonPressable: { width: '100%' },
  addButton: { alignItems: 'center', borderRadius: Radius.md, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 56, paddingHorizontal: Spacing.three, width: '100%' },
  addButtonLabel: { fontSize: 16, letterSpacing: 0.2 },
  errorCard: { borderRadius: Radius.md, borderWidth: 1, gap: Spacing.two, padding: 14 },
  errorCopy: { gap: 2 },
  loading: { alignItems: 'center', flex: 1, gap: Spacing.three, justifyContent: 'center' },
});
