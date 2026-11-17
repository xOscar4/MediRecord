import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { MedicationPhotoThumbnail } from '@/components/medication-photo-section';
import { ThemedText } from '@/components/themed-text';
import { AppIcon, StatusPill } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MedicationDoseForm, MedicationSchedule } from '@/types/medications';

export type MedicationScheduleSummary = Pick<
  MedicationSchedule,
  'id' | 'time_of_day' | 'days_of_week' | 'is_active'
>;

export const DOSE_FORM_LABELS: Record<MedicationDoseForm, string> = {
  tablet: 'Tableta',
  capsule: 'Cápsula',
  liquid: 'Líquido',
  drops: 'Gotas',
  injection: 'Inyección',
  inhaler: 'Inhalador',
  other: 'Otro',
};

const DAY_LABELS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function formatDoseText(doseAmount: string | null, doseForm: MedicationDoseForm | null): string {
  return [doseAmount, doseForm ? DOSE_FORM_LABELS[doseForm] : null].filter(Boolean).join(' · ');
}

export function formatScheduleTime(time: string): string {
  return time.slice(0, 5);
}

export function formatScheduleDays(days: number[]): string {
  return days.map((day) => DAY_LABELS[day] ?? String(day)).join(' · ');
}

function ScheduleLine({ schedule, compact }: { schedule: MedicationScheduleSummary; compact: boolean }) {
  const theme = useTheme();
  const iconSize = compact ? 24 : 28;

  return (
    <View style={styles.scheduleLine}>
      <View
        style={[
          styles.scheduleIcon,
          { backgroundColor: theme.primarySoft, borderRadius: iconSize / 3, height: iconSize, width: iconSize },
        ]}>
        <AppIcon name={{ ios: 'clock.fill', android: 'schedule' }} color={theme.primary} size={compact ? 13 : 15} />
      </View>
      <View style={styles.scheduleCopy}>
        <ThemedText type="smallBold" style={compact ? styles.scheduleTimeCompact : undefined}>
          {formatScheduleTime(schedule.time_of_day)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.scheduleDays}>
          {formatScheduleDays(schedule.days_of_week)}
        </ThemedText>
      </View>
      {!schedule.is_active ? <StatusPill label="Archivado" tone="warning" compact /> : null}
    </View>
  );
}

type MedicationSummaryHeaderProps = {
  photoPath: string | null;
  name: string;
  doseAmount: string | null;
  doseForm: MedicationDoseForm | null;
  schedules: MedicationScheduleSummary[];
  photoSize?: number;
  compact?: boolean;
  trailing?: ReactNode;
  emptyScheduleLabel?: string;
};

/**
 * Bloque visual reutilizable: fotografía cuadrada a la izquierda y, a la
 * derecha, nombre, dosis/forma y horarios de administración.
 */
export function MedicationSummaryHeader({
  photoPath,
  name,
  doseAmount,
  doseForm,
  schedules,
  photoSize = 72,
  compact = false,
  trailing,
  emptyScheduleLabel,
}: MedicationSummaryHeaderProps) {
  const dose = formatDoseText(doseAmount, doseForm);

  return (
    <View style={styles.header}>
      <MedicationPhotoThumbnail photoPath={photoPath} size={photoSize} />
      <View style={styles.copy}>
        <View style={styles.nameRow}>
          <ThemedText
            type="subtitle"
            numberOfLines={2}
            style={[styles.name, compact && styles.nameCompact]}>
            {name}
          </ThemedText>
          {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.dose}>
          {dose || 'Dosis no indicada'}
        </ThemedText>
        {schedules.length > 0 ? (
          <View style={styles.scheduleList}>
            {schedules.map((schedule) => (
              <ScheduleLine key={schedule.id} schedule={schedule} compact={compact} />
            ))}
          </View>
        ) : emptyScheduleLabel ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.emptySchedule}>{emptyScheduleLabel}</ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 14 },
  copy: { flex: 1, gap: 4, minWidth: 0 },
  nameRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  name: { flex: 1, fontSize: 21, lineHeight: 26, minWidth: 0 },
  nameCompact: { fontSize: 19, lineHeight: 24 },
  trailing: { flexShrink: 0 },
  dose: { lineHeight: 20 },
  scheduleList: { gap: Spacing.two, marginTop: 4 },
  scheduleLine: { alignItems: 'center', flexDirection: 'row', gap: 9, minWidth: 0 },
  scheduleIcon: { alignItems: 'center', flexShrink: 0, justifyContent: 'center' },
  scheduleCopy: { flex: 1, gap: 1, minWidth: 0 },
  scheduleTimeCompact: { fontSize: 13, lineHeight: 17 },
  scheduleDays: { fontSize: 12, lineHeight: 16 },
  emptySchedule: { marginTop: 2 },
});
