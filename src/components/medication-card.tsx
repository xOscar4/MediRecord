import { Pressable, StyleSheet, View } from 'react-native';
import { Link, type Href } from 'expo-router';

import { AppIcon, StatusPill, SurfaceCard } from '@/components/ui-kit';
import { MedicationPhotoThumbnail } from '@/components/medication-photo-section';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Medication, MedicationSchedule } from '@/types/medications';

const DAY_LABELS = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const FORM_LABELS: Record<string, string> = {
  tablet: 'Tableta',
  capsule: 'Cápsula',
  liquid: 'Líquido',
  drops: 'Gotas',
  injection: 'Inyección',
  inhaler: 'Inhalador',
  other: 'Otro',
};

function formatTime(time: string) {
  return time.slice(0, 5);
}

function formatDays(days: number[]) {
  return days.map((day) => DAY_LABELS[day] ?? String(day)).join(' · ');
}

function ScheduleRow({ schedule }: { schedule: MedicationSchedule }) {
  const theme = useTheme();
  return (
    <View style={styles.scheduleRow}>
      <View style={[styles.scheduleIcon, { backgroundColor: theme.primarySoft }]}>
        <AppIcon name={{ ios: 'clock.fill', android: 'schedule' }} color={theme.primary} size={17} />
      </View>
      <View style={styles.scheduleCopy}>
        <ThemedText type="smallBold">{formatTime(schedule.time_of_day)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{formatDays(schedule.days_of_week)}</ThemedText>
      </View>
      {!schedule.is_active ? <StatusPill label="Archivado" tone="warning" compact /> : null}
    </View>
  );
}

type MedicationCardProps = {
  medication: Medication;
  onArchive?: (medication: Medication) => void;
  onRestore?: (medication: Medication) => void;
  actionLoading?: boolean;
};

export function MedicationCard({ medication, onArchive, onRestore, actionLoading = false }: MedicationCardProps) {
  const theme = useTheme();
  const dose = [medication.dose_amount, medication.dose_form ? FORM_LABELS[medication.dose_form] : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <SurfaceCard style={styles.card}>
      <View style={styles.header}>
         <MedicationPhotoThumbnail photoPath={medication.photo_path} size={52} />
        <View style={styles.titleCopy}>
          <ThemedText type="subtitle" style={styles.name}>{medication.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{dose || 'Dosis no indicada'}</ThemedText>
        </View>
        <StatusPill label={medication.is_active ? 'Activo' : 'Archivado'} tone={medication.is_active ? 'success' : 'warning'} compact />
      </View>

      {medication.is_active ? (
        <Link href={`/medicamentos/${medication.id}` as Href} asChild>
          <Pressable style={({ pressed }) => [styles.editButton, { backgroundColor: theme.primarySoft, borderColor: theme.primary, opacity: pressed ? 0.78 : 1 }]}>
            <AppIcon name={{ ios: 'pencil', android: 'edit' }} color={theme.primary} size={17} />
            <ThemedText type="smallBold" style={{ color: theme.primary }}>Editar medicamento</ThemedText>
            <AppIcon name={{ ios: 'chevron.right', android: 'chevron_right' }} color={theme.primary} size={17} />
          </Pressable>
        </Link>
      ) : null}

      {medication.is_active && onArchive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Archivar ${medication.name}`}
          accessibilityState={{ disabled: actionLoading, busy: actionLoading }}
          disabled={actionLoading}
          onPress={() => onArchive(medication)}
          style={({ pressed }) => [styles.actionButton, { backgroundColor: `${theme.warning}14`, borderColor: theme.warning, opacity: actionLoading ? 0.5 : pressed ? 0.78 : 1 }]}>
          <AppIcon name={{ ios: 'archivebox', android: 'archive' }} color={theme.warning} size={18} />
          <ThemedText type="smallBold" numberOfLines={1} style={[styles.actionText, { color: theme.warning }]}>{actionLoading ? 'Archivando…' : 'Archivar medicamento'}</ThemedText>
        </Pressable>
      ) : null}

      {!medication.is_active && onRestore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Restaurar ${medication.name}`}
          accessibilityState={{ disabled: actionLoading, busy: actionLoading }}
          disabled={actionLoading}
          onPress={() => onRestore(medication)}
          style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.primarySoft, borderColor: theme.primary, opacity: actionLoading ? 0.5 : pressed ? 0.78 : 1 }]}>
          <AppIcon name={{ ios: 'archivebox', android: 'unarchive' }} color={theme.primary} size={18} />
          <ThemedText type="smallBold" numberOfLines={1} style={[styles.actionText, { color: theme.primary }]}>{actionLoading ? 'Restaurando…' : 'Restaurar medicamento'}</ThemedText>
        </Pressable>
      ) : null}

      {medication.instructions ? (
        <View style={[styles.instructions, { backgroundColor: theme.background }]}>
          <AppIcon name={{ ios: 'info.circle', android: 'info' }} color={theme.textSecondary} size={17} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.instructionsText}>{medication.instructions}</ThemedText>
        </View>
      ) : null}

      <View style={styles.scheduleHeader}>
        <ThemedText type="smallBold" themeColor="textSecondary">HORARIOS</ThemedText>
        {medication.schedules.length === 0 ? <StatusPill label="Sin horarios" tone="warning" compact /> : null}
      </View>
      {medication.schedules.length > 0 ? (
        <View style={styles.scheduleList}>
          {medication.schedules.map((schedule) => <ScheduleRow key={schedule.id} schedule={schedule} />)}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">Este medicamento todavía no tiene horarios configurados.</ThemedText>
      )}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  editButton: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 46, paddingHorizontal: 12 },
  actionButton: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 46, paddingHorizontal: 12 },
  actionText: { flex: 1 },
  titleCopy: { flex: 1, gap: 2, minWidth: 0 },
  name: { fontSize: 21, lineHeight: 26 },
  instructions: { alignItems: 'flex-start', borderRadius: 14, flexDirection: 'row', gap: 8, padding: 12 },
  instructionsText: { flex: 1 },
  scheduleHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  scheduleList: { gap: Spacing.two },
  scheduleRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  scheduleIcon: { alignItems: 'center', borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  scheduleCopy: { flex: 1, gap: 1 },
});
