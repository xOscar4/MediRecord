import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, TextField } from '@/components/form-controls';
import { DoseFormSelector } from '@/components/dose-form-selector';
import { MedicationPhotoSection } from '@/components/medication-photo-section';
import { createScheduleDraft, ScheduleEditor } from '@/components/schedule-editor';
import { FormSection, InlineMessage, PageHeader, SectionLabel, SurfaceCard } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { MedicationRegistrationError, registerMedication } from '@/lib/medications';
import { reconcileMedicationAlarms } from '@/lib/medication-alarm-reconciler';
import { MedicationPhotoError, saveMedicationPhoto, type SelectedMedicationPhoto } from '@/lib/medication-photos';
import { useAuth } from '@/providers/auth-provider';
import type { MedicationDoseForm, MedicationScheduleDraft } from '@/types/medications';

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

export default function NuevoMedicamentoScreen() {
  const { user, profile } = useAuth();
  const initialDate = getTodayInTimezone(profile?.timezone);
  const [name, setName] = useState('');
  const [doseAmount, setDoseAmount] = useState('');
  const [doseForm, setDoseForm] = useState<MedicationDoseForm | null>(null);
  const [instructions, setInstructions] = useState('');
  const [schedules, setSchedules] = useState<MedicationScheduleDraft[]>(() => [createScheduleDraft(initialDate)]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryMedicationId, setRecoveryMedicationId] = useState<string | null>(null);
  const [recoveryStage, setRecoveryStage] = useState<'schedules' | 'sync' | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<SelectedMedicationPhoto | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const saveLabel = recoveryStage === 'schedules'
    ? 'Reintentar horarios'
    : recoveryStage === 'sync'
      ? 'Reintentar sincronización'
      : 'Guardar medicamento';
  const medicationFieldsLocked = Boolean(recoveryMedicationId);

  async function handleSave() {
    if (isSaving) return;
    setError(null);
    setPhotoError(null);
    setIsSaving(true);

    try {
      if (!user) throw new Error('Tu sesión no está disponible. Vuelve a iniciar sesión.');
      const result = await registerMedication({ name, doseAmount, doseForm, instructions, schedules }, recoveryMedicationId ?? undefined);
      if (selectedPhoto) {
        try {
          await saveMedicationPhoto(result.medicationId, selectedPhoto, null);
        } catch (photoCaughtError) {
          const message = photoCaughtError instanceof MedicationPhotoError
            ? photoCaughtError.message
            : 'No pudimos guardar la fotografía. Puedes agregarla desde la edición del medicamento.';
          const fullMessage = `El medicamento se registró, pero la fotografía no pudo guardarse. ${message} Puedes agregarla desde la edición del medicamento.`;
          setPhotoError(fullMessage);
          Alert.alert('Medicamento registrado sin fotografía', fullMessage, [
            { text: 'Volver a medicamentos', onPress: () => router.back() },
          ]);
          return;
        }
      }
      await reconcileMedicationAlarms();
      Alert.alert('Medicamento registrado', 'El medicamento y sus horarios se guardaron correctamente.', [
        { text: 'Volver a medicamentos', onPress: () => router.back() },
      ]);
    } catch (caughtError) {
      if (caughtError instanceof MedicationRegistrationError && caughtError.medicationId) {
        setRecoveryMedicationId(caughtError.medicationId);
        setRecoveryStage(caughtError.stage === 'schedules' ? 'schedules' : 'sync');
      }
      setError(caughtError instanceof Error ? caughtError.message : 'No pudimos guardar el medicamento.');
    } finally {
      setIsSaving(false);
    }
  }

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
              eyebrow="Nuevo tratamiento"
              title="Agregar medicamento"
              description="Registra los datos básicos y organiza sus horarios de administración."
              icon={{ ios: 'cross.case.fill', android: 'medical_services' }}
            />

            {error ? <InlineMessage>{error}</InlineMessage> : null}

            <FormSection
              icon={{ ios: 'pills.fill', android: 'medication' }}
              title="Datos del medicamento"
              description="Nombre, dosis y presentación para identificarlo rápido.">
              <TextField
                label="Nombre del medicamento"
                value={name}
                onChangeText={setName}
                placeholder="Ej. Paracetamol"
                autoCapitalize="sentences"
                maxLength={120}
                editable={!isSaving && !medicationFieldsLocked}
              />
              <TextField
                label="Cantidad o dosis"
                value={doseAmount}
                onChangeText={setDoseAmount}
                placeholder="Ej. 500 mg"
                maxLength={120}
                editable={!isSaving && !medicationFieldsLocked}
              />
              <DoseFormSelector
                value={doseForm}
                onChange={setDoseForm}
                disabled={isSaving || medicationFieldsLocked}
              />
              <TextField
                label="Instrucciones"
                value={instructions}
                onChangeText={setInstructions}
                placeholder="Ej. Tomar después de comer"
                multiline
                maxLength={1000}
                editable={!isSaving && !medicationFieldsLocked}
                style={styles.instructionsInput}
              />
            </FormSection>

            <SurfaceCard style={styles.formCard}>
              <MedicationPhotoSection
                selectedPhoto={selectedPhoto}
                disabled={isSaving}
                error={photoError}
                onCancelSelection={() => setSelectedPhoto(null)}
                onError={(message) => setPhotoError(message || null)}
                onPhotoSelected={(photo) => { setPhotoError(null); setSelectedPhoto(photo); }}
              />
            </SurfaceCard>

            <View style={styles.sectionHeader}>
              <View style={styles.sectionCopy}>
                <SectionLabel>Administración</SectionLabel>
                <ThemedText type="subtitle" style={styles.sectionTitle}>Horarios y fechas</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">{schedules.length} {schedules.length === 1 ? 'horario' : 'horarios'}</ThemedText>
            </View>

            <ScheduleEditor
              value={schedules}
              onChange={setSchedules}
              initialDate={initialDate}
              disabled={isSaving || recoveryStage === 'sync'}
              error={recoveryStage === 'schedules' ? error : null}
            />

            <ActionButton label={saveLabel} onPress={() => void handleSave()} loading={isSaving} disabled={!user || name.trim().length === 0} size="large" />
            <ThemedText type="small" themeColor="textSecondary" style={styles.footerHint}>La fecha de inicio se muestra en la zona horaria de tu perfil.</ThemedText>
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
  content: { alignSelf: 'center', gap: Spacing.three, maxWidth: MaxContentWidth, paddingBottom: BottomTabInset + Spacing.five, paddingHorizontal: Spacing.four, paddingTop: Spacing.two, width: '100%' },
  formCard: { gap: Spacing.three },
  instructionsInput: { minHeight: 96, textAlignVertical: 'top' },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.two },
  sectionCopy: { gap: 3 },
  sectionTitle: { fontSize: 22, lineHeight: 28 },
  footerHint: { textAlign: 'center' },
});
