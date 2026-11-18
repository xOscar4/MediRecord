import { useEffect, useRef, useState } from 'react';
import { DateTimePicker, type DateTimePickerEvent } from '@expo/ui/community/datetime-picker';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { TextField } from '@/components/form-controls';
import { ReminderPermissionModal } from '@/components/reminder-permission-modal';
import {
  applyPickedValue,
  isoDateToPickerDate,
  timeOfDayToPickerDate,
} from '@/lib/schedule-time';
import {
  describeOpenedReminderSetting,
  hasSeenReminderPrompt,
  markReminderPromptSeen,
} from '@/lib/reminder-permissions';
import { AppIcon, InlineMessage, SurfaceCard } from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { ThemedText } from '@/components/themed-text';
import { useReminderPermissions } from '@/hooks/use-reminder-permissions';
import { useTheme } from '@/hooks/use-theme';
import type { MedicationScheduleDraft } from '@/types/medications';

type PickerKind = 'time' | 'startDate' | 'endDate';

type PickerTarget = {
  scheduleId: string;
  kind: PickerKind;
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
  /** Fecha congelada durante la sesión del diálogo: el picker nativo de Android
   * reconstruye su TimePickerState cuando cambia `value` mientras está abierto. */
  const [pickerDate, setPickerDate] = useState<Date | null>(null);
  /** Identificador de sesión: fuerza un montaje nuevo por cada apertura, sin
   * reutilizar el estado de un diálogo anterior. */
  const [pickerSession, setPickerSession] = useState(0);
  const [isPermissionPromptVisible, setIsPermissionPromptVisible] = useState(false);
  const [isActivatingPermissions, setIsActivatingPermissions] = useState(false);
  const [permissionHint, setPermissionHint] = useState<string | null>(null);

  const permissions = useReminderPermissions();

  // `onChange` del picker nativo puede entregarse tras un re-render. Las refs
  // se actualizan de forma síncrona para que nunca se use un target o un array
  // de horarios obsoleto.
  const valueRef = useRef(value);
  const targetRef = useRef<PickerTarget>(null);
  const permissionCheckRef = useRef(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  function parsePickerDate(target: Exclude<PickerTarget, null>): Date {
    const schedule = valueRef.current.find((item) => item.id === target.scheduleId);
    if (target.kind === 'time') {
      return timeOfDayToPickerDate(schedule?.timeOfDay ?? '08:00');
    }
    const source = target.kind === 'startDate'
      ? schedule?.startDate ?? initialDate
      : schedule?.endDate || schedule?.startDate || initialDate;
    return isoDateToPickerDate(source);
  }

  function commitChange(next: MedicationScheduleDraft[]) {
    valueRef.current = next;
    onChange(next);
  }

  function updateSchedule(id: string, update: Partial<MedicationScheduleDraft>) {
    commitChange(valueRef.current.map((schedule) => schedule.id === id ? { ...schedule, ...update } : schedule));
  }

  function openPicker(target: Exclude<PickerTarget, null>) {
    const date = parsePickerDate(target);
    targetRef.current = target;
    setPickerDate(date);
    setPickerTarget(target);
    setPickerSession((session) => session + 1);
  }

  function closePicker() {
    targetRef.current = null;
    setPickerTarget(null);
    setPickerDate(null);
  }

  async function maybePromptForPermissions() {
    if (permissionCheckRef.current) return;
    permissionCheckRef.current = true;
    try {
      // La hora ya se guardó; aquí solo se comprueba el estado real del
      // dispositivo antes de mostrar el aviso por primera vez.
      const snapshot = await permissions.refresh();
      if (!snapshot.supported || snapshot.ready) return;
      if (await hasSeenReminderPrompt()) return;
      await markReminderPromptSeen();
      setPermissionHint(null);
      setIsPermissionPromptVisible(true);
    } finally {
      permissionCheckRef.current = false;
    }
  }

  async function handleActivatePermissions() {
    setIsActivatingPermissions(true);
    setPermissionHint(null);
    try {
      const result = await permissions.activate();
      if (result.opened) {
        setPermissionHint(describeOpenedReminderSetting(result.opened));
      } else if (!result.snapshot.ready) {
        setPermissionHint('Aún faltan opciones por activar. Puedes seguir guardando, pero algunos recordatorios podrían no avisarte.');
      }
    } catch {
      setPermissionHint('No pudimos abrir los ajustes. Puedes activarlos cuando quieras desde Perfil.');
    } finally {
      setIsActivatingPermissions(false);
    }
  }

  function handleDismissPermissionPrompt() {
    setIsPermissionPromptVisible(false);
    setPermissionHint(null);
  }

  function handlePickerChange(event: DateTimePickerEvent, date?: Date) {
    const target = targetRef.current;
    if (!target || !date || Number.isNaN(date.getTime())) return;
    // Android también informa de cancelaciones/cierres: solo 'set' debe escribir.
    if (event.type !== 'set') return;

    commitChange(applyPickedValue(valueRef.current, target.scheduleId, target.kind, date));
    if (Platform.OS === 'android') closePicker();
    if (target.kind === 'time') void maybePromptForPermissions();
  }

  function handlePickerDismiss() {
    // Cancelar o cerrar el diálogo no debe modificar el horario.
    closePicker();
  }

  function toggleDay(schedule: MedicationScheduleDraft, day: number) {
    const daysOfWeek = schedule.daysOfWeek.includes(day)
      ? schedule.daysOfWeek.filter((selectedDay) => selectedDay !== day)
      : [...schedule.daysOfWeek, day].sort((first, second) => first - second);
    updateSchedule(schedule.id, { daysOfWeek });
  }

  function addSchedule() {
    commitChange([...valueRef.current, createScheduleDraft(initialDate, valueRef.current.length)]);
  }

  function removeSchedule(id: string) {
    commitChange(valueRef.current.filter((schedule) => schedule.id !== id));
  }

  const pickerValue = pickerDate ?? timeOfDayToPickerDate('08:00');
  const pickerProps = {
    key: `${pickerTarget?.scheduleId ?? 'none'}-${pickerTarget?.kind ?? 'none'}-${pickerSession}`,
    value: pickerValue,
    mode: pickerTarget?.kind === 'time' ? 'time' as const : 'date' as const,
    display: pickerTarget?.kind === 'time' ? 'clock' as const : 'calendar' as const,
    is24Hour: true,
    accentColor: theme.primary,
    positiveButton: { label: 'Aceptar' },
    negativeButton: { label: 'Cancelar' },
    onChange: handlePickerChange,
    onDismiss: handlePickerDismiss,
  };

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
              onPress={() => openPicker({ scheduleId: schedule.id, kind: 'time' })}
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
                onPress={() => openPicker({ scheduleId: schedule.id, kind: 'startDate' })}
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
                onPress={() => openPicker({ scheduleId: schedule.id, kind: 'endDate' })}
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

      {/*
       * Android: el componente nativo ya es un diálogo modal. Se monta solo
       * mientras hay un target y se desmonta al confirmar ('set') o cancelar.
       * La key de sesión evita que un re-render reutilice el TimePickerState
       * anterior con la hora inicial (08:00).
       */}
      {pickerTarget && Platform.OS === 'android' ? (
        <DateTimePicker {...pickerProps} presentation="dialog" />
      ) : null}

      {pickerTarget && Platform.OS !== 'android' ? (
        <Modal transparent animationType="fade" visible onRequestClose={handlePickerDismiss}>
          <Pressable style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]} onPress={handlePickerDismiss}>
            <Pressable style={[styles.pickerCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]} onPress={(event) => event.stopPropagation()}>
              <View style={styles.pickerHeading}>
                <View style={styles.pickerCopy}>
                  <ThemedText type="smallBold">{pickerTarget.kind === 'time' ? 'Seleccionar hora' : pickerTarget.kind === 'startDate' ? 'Seleccionar inicio' : 'Seleccionar finalización'}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">Puedes confirmar o cancelar desde el selector.</ThemedText>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Cerrar selector" onPress={handlePickerDismiss} style={styles.closeButton}>
                  <AppIcon name={{ ios: 'xmark', android: 'close' }} color={theme.textSecondary} size={20} />
                </Pressable>
              </View>
              <DateTimePicker {...pickerProps} presentation="inline" />
              <Pressable accessibilityRole="button" onPress={handlePickerDismiss} style={[styles.closePickerButton, { backgroundColor: theme.primary }]}>
                <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>Cerrar</ThemedText>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      {!isPermissionPromptVisible && permissions.state.loaded && permissions.state.supported && !permissions.state.ready ? (
        <InlineMessage tone="info">
          Tu hora quedó guardada, pero algunos recordatorios podrían no avisarte. Puedes activarlos cuando quieras desde Perfil.
        </InlineMessage>
      ) : null}

      <ReminderPermissionModal
        visible={isPermissionPromptVisible}
        state={permissions.state}
        busy={isActivatingPermissions}
        hint={permissionHint}
        onActivate={() => void handleActivatePermissions()}
        onDismiss={handleDismissPermissionPrompt}
      />
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
  container: { gap: Spacing.four },
  scheduleCard: { gap: Spacing.four },
  scheduleHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  scheduleTitleCopy: { flex: 1, gap: Spacing.half },
  iconButton: { alignItems: 'center', borderRadius: 12, height: 40, justifyContent: 'center', width: 40 },
  timeSection: { gap: Spacing.three },
  timeButton: { alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 68, paddingHorizontal: 12 },
  timeIcon: { alignItems: 'center', borderRadius: Radius.sm, height: 40, justifyContent: 'center', width: 40 },
  timeValue: { flex: 1, fontVariant: ['tabular-nums'] },
  timeAction: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  daysSection: { gap: Spacing.three },
  daysRow: { flexDirection: 'row', gap: Spacing.two },
  dayButton: { alignItems: 'center', borderRadius: Radius.sm, borderWidth: 1, flex: 1, height: 42, justifyContent: 'center', minWidth: 0 },
  dateRow: { flexDirection: 'row', gap: Spacing.three },
  dateField: { flex: 1, gap: Spacing.two, minWidth: 0 },
  notesInput: { minHeight: 78, textAlignVertical: 'top' },
  pickerTrigger: { alignItems: 'center', borderRadius: Radius.sm, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 6, minHeight: 44, minWidth: 0, paddingHorizontal: 8, paddingVertical: 6 },
  pickerTriggerLabel: { flex: 1, flexShrink: 1, minWidth: 0 },
  addButton: { alignItems: 'center', borderRadius: Radius.md, borderWidth: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 52, paddingHorizontal: 14 },
  modalBackdrop: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: Spacing.four },
  pickerCard: { borderRadius: Radius.lg, borderWidth: 1, gap: Spacing.four, maxWidth: 420, padding: Spacing.three, width: '100%' },
  pickerHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  pickerCopy: { flex: 1, gap: Spacing.half },
  closeButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  closePickerButton: { alignItems: 'center', borderRadius: Radius.md, minHeight: 46, justifyContent: 'center' },
});
