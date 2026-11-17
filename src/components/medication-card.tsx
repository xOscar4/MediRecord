import { Pressable, StyleSheet, View } from 'react-native';
import { Link, type Href } from 'expo-router';

import { MedicationSummaryHeader } from '@/components/medication-summary';
import { AppIcon, StatusPill, SurfaceCard } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Medication } from '@/types/medications';

type MedicationCardProps = {
  medication: Medication;
  onArchive?: (medication: Medication) => void;
  onRestore?: (medication: Medication) => void;
  actionLoading?: boolean;
};

export function MedicationCard({ medication, onArchive, onRestore, actionLoading = false }: MedicationCardProps) {
  const theme = useTheme();

  return (
    <SurfaceCard style={styles.card}>
      <MedicationSummaryHeader
        photoPath={medication.photo_path}
        name={medication.name}
        doseAmount={medication.dose_amount}
        doseForm={medication.dose_form}
        schedules={medication.schedules}
        photoSize={72}
        emptyScheduleLabel="Sin horarios configurados"
        trailing={(
          <StatusPill label={medication.is_active ? 'Activo' : 'Archivado'} tone={medication.is_active ? 'success' : 'warning'} compact />
        )}
      />

      {medication.instructions ? (
        <View style={[styles.instructions, { backgroundColor: theme.background }]}>
          <AppIcon name={{ ios: 'info.circle', android: 'info' }} color={theme.textSecondary} size={17} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.instructionsText}>{medication.instructions}</ThemedText>
        </View>
      ) : null}

      {medication.is_active ? (
        <View style={[styles.actions, { borderTopColor: theme.border }]}>
          <Link href={`/medicamentos/${medication.id}` as Href} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Editar ${medication.name}`}
              style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.primarySoft, borderColor: theme.primary, opacity: pressed ? 0.78 : 1 }]}>
              <AppIcon name={{ ios: 'pencil', android: 'edit' }} color={theme.primary} size={17} />
              <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.primary }}>Editar</ThemedText>
            </Pressable>
          </Link>

          {onArchive ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Archivar ${medication.name}`}
              accessibilityState={{ disabled: actionLoading, busy: actionLoading }}
              disabled={actionLoading}
              onPress={() => onArchive(medication)}
              style={({ pressed }) => [styles.actionButton, { backgroundColor: `${theme.warning}12`, borderColor: theme.warning, opacity: actionLoading ? 0.5 : pressed ? 0.78 : 1 }]}>
              <AppIcon name={{ ios: 'archivebox', android: 'archive' }} color={theme.warning} size={17} />
              <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.warning }}>{actionLoading ? 'Archivando…' : 'Archivar'}</ThemedText>
            </Pressable>
          ) : null}
        </View>
      ) : onRestore ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Restaurar ${medication.name}`}
          accessibilityState={{ disabled: actionLoading, busy: actionLoading }}
          disabled={actionLoading}
          onPress={() => onRestore(medication)}
          style={({ pressed }) => [styles.restoreButton, { backgroundColor: theme.primarySoft, borderColor: theme.primary, opacity: actionLoading ? 0.5 : pressed ? 0.78 : 1 }]}>
          <AppIcon name={{ ios: 'archivebox', android: 'unarchive' }} color={theme.primary} size={18} />
          <ThemedText type="smallBold" numberOfLines={1} style={[styles.actionText, { color: theme.primary }]}>{actionLoading ? 'Restaurando…' : 'Restaurar medicamento'}</ThemedText>
        </Pressable>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  instructions: { alignItems: 'flex-start', borderRadius: 12, flexDirection: 'row', gap: 8, padding: 12 },
  instructionsText: { flex: 1 },
  actions: { borderTopWidth: 1, flexDirection: 'row', gap: Spacing.two, paddingTop: Spacing.three },
  actionButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 46, paddingHorizontal: 10 },
  restoreButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48, paddingHorizontal: 12 },
  actionText: { flexShrink: 1 },
});
