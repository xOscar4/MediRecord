import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, TextField } from '@/components/form-controls';
import { MedicationPhotoSection } from '@/components/medication-photo-section';
import { createScheduleDraft, ScheduleEditor } from '@/components/schedule-editor';
import { AppIcon, SectionLabel, SurfaceCard } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MedicationRegistrationError, registerMedication } from '@/lib/medications';
import { reconcileMedicationAlarms } from '@/lib/medication-alarm-reconciler';
import { MedicationPhotoError, saveMedicationPhoto, type SelectedMedicationPhoto } from '@/lib/medication-photos';
import { useAuth } from '@/providers/auth-provider';
import type { MedicationDoseForm, MedicationScheduleDraft } from '@/types/medications';

const DOSE_FORMS: { value: MedicationDoseForm; label: string }[] = [
  { value: 'tablet', label: 'Tableta' },
  { value: 'capsule', label: 'Cápsula' },
  { value: 'liquid', label: 'Líquido' },
  { value: 'drops', label: 'Gotas' },
  { value: 'injection', label: 'Inyección' },
  { value: 'inhaler', label: 'Inhalador' },
  { value: 'other', label: 'Otro' },
];

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
  const theme = useTheme();
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
            <View style={styles.intro}>
              <SectionLabel>Nuevo tratamiento</SectionLabel>
              <ThemedText type="title" style={styles.title}>Agregar medicamento</ThemedText>
              <ThemedText themeColor="textSecondary">Registra los datos básicos y organiza sus horarios de administración.</ThemedText>
            </View>

            {error ? (
              <View style={[styles.errorCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <AppIcon name={{ ios: 'exclamationmark.triangle', android: 'warning' }} color={theme.danger} size={22} />
                <ThemedText type="small" style={styles.errorText}>{error}</ThemedText>
              </View>
            ) : null}

            <SurfaceCard style={styles.formCard}>
              <View style={styles.cardHeading}>
                <AppIcon name={{ ios: 'pills.fill', android: 'medication' }} color={theme.primary} size={22} />
                <ThemedText type="subtitle" style={styles.cardTitle}>Información del medicamento</ThemedText>
              </View>
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
              <View style={styles.choiceSection}>
                <ThemedText type="smallBold" themeColor="textSecondary">FORMA FARMACÉUTICA</ThemedText>
                <View style={styles.choiceGrid}>
                  {DOSE_FORMS.map((form) => {
                    const selected = doseForm === form.value;
                    return (
                      <Pressable
                        key={form.value}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected, disabled: isSaving || medicationFieldsLocked }}
                        disabled={isSaving || medicationFieldsLocked}
                        onPress={() => setDoseForm(selected ? null : form.value)}
                        style={[styles.choice, { backgroundColor: selected ? theme.primarySoft : theme.background, borderColor: selected ? theme.primary : theme.border, opacity: isSaving || medicationFieldsLocked ? 0.55 : 1 }]}>
                        <ThemedText type="smallBold" style={{ color: selected ? theme.primary : theme.textSecondary }}>{form.label}</ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
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
             </SurfaceCard>

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
                <ThemedText type="subtitle">Horarios y fechas</ThemedText>
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

            <ActionButton label={saveLabel} onPress={() => void handleSave()} loading={isSaving} disabled={!user || name.trim().length === 0} />
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
  intro: { gap: 6 },
  title: { fontSize: 32, lineHeight: 38 },
  errorCard: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 14 },
  errorText: { color: '#C94A50', flex: 1 },
  formCard: { gap: Spacing.three },
  cardHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  cardTitle: { fontSize: 22, lineHeight: 28 },
  choiceSection: { gap: Spacing.two },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderRadius: 13, borderWidth: 1, minHeight: 42, paddingHorizontal: 12, paddingVertical: 10 },
  instructionsInput: { minHeight: 92, textAlignVertical: 'top' },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.two },
  sectionCopy: { gap: 3 },
  footerHint: { textAlign: 'center' },
});
