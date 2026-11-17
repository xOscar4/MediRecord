import { useState } from 'react';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { TextField } from '@/components/form-controls';
import { AppIcon, SurfaceCard } from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import type { MedicationScheduleDraft } from '@/types/medications';

type PickerTarget = {
  scheduleId: string;
  kind: 'time' | 'startDate' | 'endDate';
} | null;

const DAYS = [
  { value: 1, label: 'L' },
  { value: 2, label: 'M' },
  { value: 3, label: 'X' },
  { value: 4, label: 'J' },
  { value: 5, label: 'V' },
  { value: 6, label: 'S' },
  { value: 7, label: 'D' },
];

export function createScheduleDraft(initialDate: string, index = 0): MedicationScheduleDraft {
  return {
    id: `schedule-${Date.now()}-${index}`,
    timeOfDay: index === 0 ? '08:00' : '20:00',
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7],
    startDate: initialDate,
    endDate: '',
  };
}

type ScheduleEditorProps = {
  value: MedicationScheduleDraft[];
  onChange: (schedules: MedicationScheduleDraft[]) => void;
  initialDate: string;
  disabled?: boolean;
  error?: string | null;
  showNotes?: boolean;
};

export function ScheduleEditor({ value, onChange, initialDate, disabled = false, error, showNotes = false }: ScheduleEditorProps) {
  const theme = useTheme();
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);

  function parsePickerDate(target: Exclude<PickerTarget, null>): Date {
    const schedule = value.find((item) => item.id === target.scheduleId);
    const source = target.kind === 'time'
      ? schedule?.timeOfDay ?? '08:00'
      : target.kind === 'startDate'
        ? schedule?.startDate ?? initialDate
        : schedule?.endDate || schedule?.startDate || initialDate;

    if (target.kind === 'time') {
      const [hours, minutes] = source.split(':').map(Number);
      const date = new Date();
      date.setHours(hours || 0, minutes || 0, 0, 0);
      return date;
    }

    const [year, month, day] = source.split('-').map(Number);
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setFullYear(year || date.getFullYear(), (month || 1) - 1, day || 1);
    return date;
  }

  function formatPickerDate(date: Date, kind: Exclude<PickerTarget, null>['kind']): string {
    if (kind === 'time') {
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function handlePickerValue(date: Date) {
    if (!pickerTarget) return;
    updateSchedule(pickerTarget.scheduleId, {
      [pickerTarget.kind]: formatPickerDate(date, pickerTarget.kind),
    });
    if (Platform.OS === 'android') setPickerTarget(null);
  }

  function updateSchedule(id: string, update: Partial<MedicationScheduleDraft>) {
    onChange(value.map((schedule) => schedule.id === id ? { ...schedule, ...update } : schedule));
  }

  function toggleDay(schedule: MedicationScheduleDraft, day: number) {
    const daysOfWeek = schedule.daysOfWeek.includes(day)
      ? schedule.daysOfWeek.filter((selectedDay) => selectedDay !== day)
      : [...schedule.daysOfWeek, day].sort((first, second) => first - second);
    updateSchedule(schedule.id, { daysOfWeek });
  }

  function addSchedule() {
    onChange([...value, createScheduleDraft(initialDate, value.length)]);
  }

  function removeSchedule(id: string) {
    onChange(value.filter((schedule) => schedule.id !== id));
  }

  return (
    <View style={styles.container}>
      {value.map((schedule, index) => (
        <SurfaceCard key={schedule.id} style={styles.scheduleCard}>
          <View style={styles.scheduleHeading}>
            <View style={styles.scheduleTitleCopy}>
              <ThemedText type="smallBold">Horario {index + 1}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Elige la hora y los días de administración.</ThemedText>
            </View>
            {!schedule.persistedId ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Eliminar horario ${index + 1}`}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => removeSchedule(schedule.id)}
                style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.background, opacity: disabled ? 0.45 : pressed ? 0.7 : 1 }]}>
                <AppIcon name={{ ios: 'trash', android: 'delete' }} color={theme.danger} size={19} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.timeSection}>
            <ThemedText type="smallBold" themeColor="textSecondary">HORA DE ADMINISTRACIÓN</ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Cambiar hora del horario ${index + 1}`}
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => setPickerTarget({ scheduleId: schedule.id, kind: 'time' })}
              style={({ pressed }) => [styles.timeButton, { backgroundColor: theme.background, borderColor: theme.border, opacity: disabled ? 0.45 : pressed ? 0.78 : 1 }]}>
              <View style={[styles.timeIcon, { backgroundColor: theme.primarySoft }]}>
                <AppIcon name={{ ios: 'clock.fill', android: 'schedule' }} color={theme.primary} size={20} />
              </View>
              <ThemedText type="subtitle" style={styles.timeValue}>{schedule.timeOfDay}</ThemedText>
              <View style={styles.timeAction}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>Cambiar</ThemedText>
                <AppIcon name={{ ios: 'chevron.right', android: 'chevron_right' }} color={theme.primary} size={18} />
              </View>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary">Selecciona la hora con el reloj; se guardará como HH:MM.</ThemedText>
          </View>

          <View style={styles.daysSection}>
            <ThemedText type="smallBold" themeColor="textSecondary">DÍAS DE LA SEMANA</ThemedText>
            <View style={styles.daysRow}>
              {DAYS.map((day) => {
                const selected = schedule.daysOfWeek.includes(day.value);
                return (
                  <Pressable
                    key={day.value}
                    accessibilityRole="checkbox"
                    accessibilityLabel={day.value === 1 ? 'Lunes' : day.value === 2 ? 'Martes' : day.value === 3 ? 'Miércoles' : day.value === 4 ? 'Jueves' : day.value === 5 ? 'Viernes' : day.value === 6 ? 'Sábado' : 'Domingo'}
                    accessibilityState={{ checked: selected, disabled }}
                    disabled={disabled}
                    onPress={() => toggleDay(schedule, day.value)}
                    style={[styles.dayButton, { backgroundColor: selected ? theme.primary : theme.background, borderColor: selected ? theme.primary : theme.border, opacity: disabled ? 0.55 : 1 }]}>
                    <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.textSecondary }}>{day.label}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.dateRow}>
            <View style={styles.dateField}>
              <TextField
                label="Fecha de inicio"
                value={schedule.startDate}
                onChangeText={(startDate) => updateSchedule(schedule.id, { startDate })}
                placeholder="AAAA-MM-DD"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                editable={!disabled}
              />
              <PickerTrigger
                label="Elegir fecha de inicio"
                icon={{ ios: 'calendar', android: 'calendar_month' }}
                disabled={disabled}
                onPress={() => setPickerTarget({ scheduleId: schedule.id, kind: 'startDate' })}
              />
            </View>
            <View style={styles.dateField}>
              <TextField
                label="Fecha de finalización"
                value={schedule.endDate}
                onChangeText={(endDate) => updateSchedule(schedule.id, { endDate })}
                placeholder="Opcional"
                keyboardType="numbers-and-punctuation"
                maxLength={10}
                editable={!disabled}
              />
              <PickerTrigger
                label="Elegir fecha final"
                icon={{ ios: 'calendar.badge.clock', android: 'event' }}
                disabled={disabled}
                onPress={() => setPickerTarget({ scheduleId: schedule.id, kind: 'endDate' })}
              />
            </View>
          </View>
          {showNotes ? (
            <TextField
              label="Notas del horario"
              value={schedule.notes ?? ''}
              onChangeText={(notes) => updateSchedule(schedule.id, { notes })}
              placeholder="Opcional"
              multiline
              maxLength={500}
              editable={!disabled}
              style={styles.notesInput}
            />
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">Usa el formato AAAA-MM-DD. La fecha final es opcional.</ThemedText>
        </SurfaceCard>
      ))}

      {error ? <ThemedText type="small" style={{ color: theme.danger }}>{error}</ThemedText> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={addSchedule}
        style={({ pressed }) => [styles.addButton, { backgroundColor: theme.primarySoft, borderColor: theme.primary, opacity: disabled ? 0.45 : pressed ? 0.78 : 1 }]}>
        <AppIcon name={{ ios: 'plus.circle.fill', android: 'add_circle' }} color={theme.primary} size={21} />
        <ThemedText type="smallBold" style={{ color: theme.primary }}>Agregar otro horario</ThemedText>
      </Pressable>

      {/* En Android el componente nativo ya es un diálogo modal: debe montarse
          directamente y desmontarse al confirmar o cancelar. Envolverlo en un
          Modal de React Native puede impedir que llegue la confirmación. */}
      {pickerTarget && Platform.OS === 'android' ? (
        <DateTimePicker
          value={parsePickerDate(pickerTarget)}
          mode={pickerTarget.kind === 'time' ? 'time' : 'date'}
          display={pickerTarget.kind === 'time' ? 'clock' : 'calendar'}
          presentation="dialog"
          is24Hour
          accentColor={theme.primary}
          onValueChange={(_event, date) => handlePickerValue(date)}
          onDismiss={() => setPickerTarget(null)}
        />
      ) : null}

      {pickerTarget && Platform.OS !== 'android' ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setPickerTarget(null)}>
          <Pressable style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]} onPress={() => setPickerTarget(null)}>
            <Pressable style={[styles.pickerCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]} onPress={(event) => event.stopPropagation()}>
              <View style={styles.pickerHeading}>
                <View style={styles.pickerCopy}>
                  <ThemedText type="smallBold">{pickerTarget.kind === 'time' ? 'Seleccionar hora' : pickerTarget.kind === 'startDate' ? 'Seleccionar inicio' : 'Seleccionar finalización'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">Puedes confirmar o cancelar desde el selector.</ThemedText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Cerrar selector" onPress={() => setPickerTarget(null)} style={styles.closeButton}>
                  <AppIcon name={{ ios: 'xmark', android: 'close' }} color={theme.textSecondary} size={20} />
                </Pressable>
              </View>
              <DateTimePicker
                value={parsePickerDate(pickerTarget)}
                mode={pickerTarget.kind === 'time' ? 'time' : 'date'}
                display={pickerTarget.kind === 'time' ? 'clock' : 'calendar'}
                presentation="inline"
                is24Hour
                accentColor={theme.primary}
                onValueChange={(_event, date) => handlePickerValue(date)}
                onDismiss={() => setPickerTarget(null)}
              />
              <Pressable accessibilityRole="button" onPress={() => setPickerTarget(null)} style={[styles.closePickerButton, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>Cerrar</ThemedText>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

function PickerTrigger({ label, icon, disabled, onPress }: { label: string; icon: { ios: 'clock' | 'calendar' | 'calendar.badge.clock'; android: 'schedule' | 'calendar_month' | 'event' }; disabled: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.pickerTrigger, { backgroundColor: theme.background, borderColor: theme.border, opacity: disabled ? 0.45 : pressed ? 0.78 : 1 }]}>
      <AppIcon name={icon} color={theme.primary} size={17} />
      <ThemedText type="smallBold" numberOfLines={2} style={styles.pickerTriggerLabel}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.three },
  scheduleCard: { gap: Spacing.three },
  scheduleHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  scheduleTitleCopy: { flex: 1, gap: 2 },
  iconButton: { alignItems: 'center', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  timeSection: { gap: Spacing.two },
  timeButton: { alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 66, paddingHorizontal: 12 },
  timeIcon: { alignItems: 'center', borderRadius: Radius.sm, height: 40, justifyContent: 'center', width: 40 },
  timeValue: { flex: 1, fontVariant: ['tabular-nums'] },
  timeAction: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  daysSection: { gap: Spacing.two },
  daysRow: { flexDirection: 'row', gap: Spacing.one },
  dayButton: { alignItems: 'center', borderRadius: Radius.sm, borderWidth: 1, flex: 1, height: 40, justifyContent: 'center', minWidth: 0 },
  dateRow: { flexDirection: 'row', gap: Spacing.two },
  dateField: { flex: 1, minWidth: 0 },
  notesInput: { minHeight: 78, textAlignVertical: 'top' },
  pickerTrigger: { alignItems: 'center', borderRadius: Radius.sm, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 6, minHeight: 44, minWidth: 0, paddingHorizontal: 8, paddingVertical: 6 },
  pickerTriggerLabel: { flex: 1, flexShrink: 1, minWidth: 0 },
  addButton: { alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 52, paddingHorizontal: 14 },
  modalBackdrop: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: Spacing.four },
  pickerCard: { borderRadius: Radius.lg, borderWidth: 1, gap: Spacing.three, maxWidth: 420, padding: Spacing.three, width: '100%' },
  pickerHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  pickerCopy: { flex: 1, gap: 3 },
  closeButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  closePickerButton: { alignItems: 'center', borderRadius: Radius.md, minHeight: 46, justifyContent: 'center' },
});
