import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, TextField } from '@/components/form-controls';
import { DoseFormSelector } from '@/components/dose-form-selector';
import { MedicationPhotoSection, useMedicationPhotoUrl } from '@/components/medication-photo-section';
import { ScheduleEditor } from '@/components/schedule-editor';
import { AppIcon, FormSection, InlineMessage, LoadingState, PageHeader, SectionLabel, SurfaceCard } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useMedicationArchive } from '@/hooks/use-medication-archive';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchMedicationById,
  MedicationEditError,
  saveMedicationScheduleChange,
  updateMedicationDetails,
  validateMedicationDetails,
  validateScheduleDrafts,
} from '@/lib/medications';
import { reconcileMedicationAlarms } from '@/lib/medication-alarm-reconciler';
import { clearMedicationPhoto, MedicationPhotoError, saveMedicationPhoto, type SelectedMedicationPhoto } from '@/lib/medication-photos';
import { useAuth } from '@/providers/auth-provider';
import type { Medication, MedicationDoseForm, MedicationSchedule, MedicationScheduleDraft } from '@/types/medications';

function getTodayInTimezone(timezone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone || undefined,
    year: 'numeric',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function toScheduleDraft(schedule: MedicationSchedule): MedicationScheduleDraft {
  return {
    id: schedule.id,
    persistedId: schedule.id,
    timeOfDay: schedule.time_of_day.slice(0, 5),
    daysOfWeek: [...schedule.days_of_week],
    startDate: schedule.start_date,
    endDate: schedule.end_date ?? '',
    notes: schedule.notes ?? '',
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No pudimos cargar el medicamento. Inténtalo de nuevo.';
}

export default function EditarMedicamentoScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const { user, profile } = useAuth();
  const theme = useTheme();
  const medicationId = typeof id === 'string' ? id : id?.[0] ?? '';
  const [medication, setMedication] = useState<Medication | null>(null);
  const [originalSchedules, setOriginalSchedules] = useState<MedicationSchedule[]>([]);
  const [schedules, setSchedules] = useState<MedicationScheduleDraft[]>([]);
  const [name, setName] = useState('');
  const [doseAmount, setDoseAmount] = useState('');
  const [doseForm, setDoseForm] = useState<MedicationDoseForm | null>(null);
  const [instructions, setInstructions] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedMedicationPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isPhotoActionLoading, setIsPhotoActionLoading] = useState(false);
  const existingPhotoUrl = useMedicationPhotoUrl(medication?.photo_path ?? null);

  const applyMedication = useCallback((detail: Medication) => {
    const activeSchedules = detail.schedules.filter((schedule) => schedule.is_active);
    setMedication(detail);
    setName(detail.name);
    setDoseAmount(detail.dose_amount ?? '');
    setDoseForm(detail.dose_form);
    setInstructions(detail.instructions ?? '');
    setOriginalSchedules(activeSchedules);
    setSchedules(activeSchedules.map(toScheduleDraft));
    setSelectedPhoto(null);
    setPhotoError(null);
  }, []);

  const refreshMedication = useCallback(async () => {
    const detail = await fetchMedicationById(medicationId);
    if (!detail.is_active) {
      throw new Error('Los medicamentos archivados no se pueden editar desde esta pantalla.');
    }
    applyMedication(detail);
  }, [applyMedication, medicationId]);

  const loadMedication = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      await refreshMedication();
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [refreshMedication]);

  // Cargar una sola vez por medicamento: recargar en cada foco sobrescribía el
  // horario recién elegido con el valor de la base de datos antes de guardar.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    // Diferir la carga para no llamar a setState de forma síncrona en el effect.
    void Promise.resolve().then(() => { void loadMedication(); });
  }, [loadMedication, medicationId, userId]);

  const archive = useMedicationArchive({
    confirmationTitle: 'Eliminar medicamento',
    onArchived: (_result, medication) => {
      Alert.alert(
        'Medicamento movido a Archivados',
        `${medication.name} ya no aparecerá en tu agenda activa. Sus datos y su historial de tomas se conservan.`,
        [{ text: 'Volver a medicamentos', onPress: () => router.back() }]
      );
    },
  });

  async function handleSave() {
    if (isSaving || !medication || !user) return;
    setSaveError(null);
    setPhotoError(null);
    setIsSaving(true);

    try {
      const normalizedDetails = validateMedicationDetails({ name, doseAmount, doseForm, instructions });
      const normalizedSchedules = validateScheduleDrafts(schedules, false);
      await updateMedicationDetails(medication.id, normalizedDetails);

      const originalById = new Map(originalSchedules.map((schedule) => [schedule.id, schedule]));
      const nextSchedules = [...normalizedSchedules];

      for (let index = 0; index < normalizedSchedules.length; index += 1) {
        const draft = normalizedSchedules[index];
        if (!draft) continue;
        const original = draft.persistedId ? originalById.get(draft.persistedId) ?? null : null;
        const result = await saveMedicationScheduleChange(medication.id, draft, original);
        // replace_schedule archiva el horario y crea uno nuevo con otro ID.
        // El editor debe usar el ID nuevo también como clave local; si no, un
        // segundo guardado intentaría modificar el horario archivado.
        nextSchedules[index] = { ...draft, id: result.scheduleId, persistedId: result.scheduleId };
      }

      if (selectedPhoto) {
        await saveMedicationPhoto(medication.id, selectedPhoto, medication.photo_path);
        setSelectedPhoto(null);
      }

      setSchedules(nextSchedules);
      await refreshMedication();
      await reconcileMedicationAlarms();
      Alert.alert('Cambios guardados', 'El medicamento y sus horarios se actualizaron correctamente.', [
        { text: 'Volver a medicamentos', onPress: () => router.back() },
      ]);
    } catch (error) {
      if (error instanceof MedicationEditError && error.scheduleId) {
        try {
          await refreshMedication();
        } catch {
          // Conserva el error original si la recarga posterior también falla.
        }
      }
      if (error instanceof MedicationPhotoError) setPhotoError(error.message);
      setSaveError(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function requestRemovePhoto() {
    if (isSaving || isPhotoActionLoading || !medication?.photo_path) return;
    Alert.alert(
      'Quitar fotografía',
      '¿Quieres quitar la fotografía de este medicamento? No se modificarán sus datos, horarios ni historial de tomas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Quitar fotografía', style: 'destructive', onPress: () => void removePhoto() },
      ]
    );
  }

  async function removePhoto() {
    if (isSaving || isPhotoActionLoading || !medication) return;
    setPhotoError(null);
    setIsPhotoActionLoading(true);
    try {
      await clearMedicationPhoto(medication.id);
      setSelectedPhoto(null);
      await refreshMedication();
      Alert.alert('Fotografía quitada', 'La fotografía se eliminó sin modificar el medicamento ni sus horarios.');
    } catch (error) {
      try {
        await refreshMedication();
      } catch {
        // Conserva el error original si la recarga posterior también falla.
      }
      setPhotoError(errorMessage(error));
    } finally {
      setIsPhotoActionLoading(false);
    }
  }

  function requestDelete() {
    if (isSaving || archive.pendingId || isPhotoActionLoading || !medication || !user) return;
    archive.clearError();
    archive.requestArchive(medication);
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <LoadingState label="Cargando medicamento…" />
      </ThemedView>
    );
  }

  if (loadError || !medication) {
    return (
      <ThemedView style={styles.centered}>
        <AppIcon name={{ ios: 'exclamationmark.triangle', android: 'warning' }} color={theme.danger} size={34} />
        <ThemedText type="smallBold" style={{ color: theme.danger, textAlign: 'center' }}>{loadError ?? 'No encontramos el medicamento.'}</ThemedText>
        <ActionButton label="Reintentar" onPress={() => void loadMedication()} tone="neutral" />
      </ThemedView>
    );
  }

  const initialDate = schedules[0]?.startDate ?? getTodayInTimezone(profile?.timezone);
  const formBusy = isSaving || archive.pendingId !== null || isPhotoActionLoading;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={styles.content}
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <PageHeader
              eyebrow="Tratamiento"
              title="Editar medicamento"
              description="Actualiza los datos y horarios sin modificar el historial de tomas."
              icon={{ ios: 'pencil', android: 'edit' }}
            />

            {saveError ? <InlineMessage>{saveError}</InlineMessage> : null}

            <FormSection
              icon={{ ios: 'pills.fill', android: 'medication' }}
              title="Datos del medicamento"
              description="Ajusta el nombre, la dosis y su presentación.">
              <TextField label="Nombre del medicamento" value={name} onChangeText={setName} maxLength={120} editable={!formBusy} />
              <TextField label="Cantidad o dosis" value={doseAmount} onChangeText={setDoseAmount} maxLength={120} editable={!formBusy} />
              <DoseFormSelector value={doseForm} onChange={setDoseForm} disabled={formBusy} />
              <TextField label="Instrucciones" value={instructions} onChangeText={setInstructions} placeholder="Opcional" multiline maxLength={1000} editable={!formBusy} style={styles.instructionsInput} />
            </FormSection>

            <SurfaceCard style={styles.formCard}>
              <MedicationPhotoSection
                selectedPhoto={selectedPhoto}
                existingPhotoPath={medication.photo_path}
                existingPhotoUrl={existingPhotoUrl}
                disabled={formBusy}
                loading={isPhotoActionLoading}
                error={photoError}
                onCancelSelection={() => setSelectedPhoto(null)}
                onError={(message) => setPhotoError(message || null)}
                onPhotoSelected={(photo) => { setPhotoError(null); setSelectedPhoto(photo); }}
                onRemove={requestRemovePhoto}
              />
            </SurfaceCard>

            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <SectionLabel>Administración</SectionLabel>
                <ThemedText type="subtitle" style={styles.sectionTitle}>Horarios y fechas</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{schedules.length} {schedules.length === 1 ? 'horario' : 'horarios'}</ThemedText>
            </View>

            <ScheduleEditor value={schedules} onChange={setSchedules} initialDate={initialDate} disabled={formBusy} showNotes error={saveError} />

            <ActionButton label="Guardar cambios" onPress={() => void handleSave()} loading={isSaving} disabled={!user || name.trim().length === 0} size="large" />
            <ThemedText type="small" themeColor="textSecondary" style={styles.footerHint}>Los horarios existentes no se eliminan; sus cambios respetan el historial de tomas.</ThemedText>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Eliminar medicamento"
              accessibilityState={{ disabled: formBusy || !user, busy: archive.isPending(medication.id) }}
              disabled={formBusy || !user}
              onPress={requestDelete}
              style={({ pressed }) => [
                styles.deleteButton,
                {
                  backgroundColor: `${theme.danger}0F`,
                  borderColor: `${theme.danger}33`,
                  opacity: formBusy || !user ? 0.45 : pressed ? 0.78 : 1,
                },
              ]}>
              <AppIcon name={{ ios: 'trash', android: 'delete' }} color={theme.danger} size={19} />
              <ThemedText type="smallBold" style={{ color: theme.danger }}>
                {archive.isPending(medication.id) ? 'Moviendo a Archivados…' : 'Eliminar medicamento'}
              </ThemedText>
            </Pressable>
            {archive.error ? <InlineMessage>{archive.error}</InlineMessage> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  safeArea: { flex: 1 },
  content: { alignSelf: 'center', gap: Spacing.four, maxWidth: MaxContentWidth, paddingBottom: BottomTabInset + Spacing.five, paddingHorizontal: Spacing.four, paddingTop: Spacing.two, width: '100%' },
  centered: { alignItems: 'center', flex: 1, gap: Spacing.three, justifyContent: 'center', padding: Spacing.four },
  formCard: { gap: Spacing.four },
  instructionsInput: { minHeight: 96, textAlignVertical: 'top' },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.three },
  sectionCopy: { gap: 3 },
  sectionTitle: { fontSize: 22, lineHeight: 28 },
  footerHint: { textAlign: 'center' },
  deleteButton: { alignItems: 'center', borderCurve: 'continuous', borderRadius: Radius.md, borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 52, paddingHorizontal: Spacing.three },
});
