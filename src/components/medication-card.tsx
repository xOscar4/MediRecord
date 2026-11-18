import { StyleSheet, View } from 'react-native';
import { Link, type Href } from 'expo-router';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

import { MedicationSummaryHeader } from '@/components/medication-summary';
import { AnimatedPressable, AppIcon, StatusPill, SurfaceCard } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Medication } from '@/types/medications';

type MedicationCardProps = {
  medication: Medication;
  onArchive?: (medication: Medication) => void;
  onRestore?: (medication: Medication) => void;
  onDelete?: (medication: Medication) => void;
  actionLoading?: boolean;
};

const STATE_FADE = FadeIn.duration(180).reduceMotion(ReduceMotion.System);

export function MedicationCard({ medication, onArchive, onRestore, onDelete, actionLoading = false }: MedicationCardProps) {
  const theme = useTheme();
  const isActive = medication.is_active;
  const quickAction = isActive ? onArchive : onDelete;
  const quickActionDisabled = actionLoading || !quickAction;
  const quickActionLabel = isActive
    ? `Mover ${medication.name} a Archivados`
    : `Eliminar definitivamente ${medication.name}`;

  const deleteAction = quickAction ? (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={quickActionLabel}
      accessibilityHint={isActive ? 'Mueve el medicamento a la sección Archivados' : 'Solicita la eliminación definitiva del medicamento'}
      accessibilityState={{ disabled: quickActionDisabled, busy: actionLoading }}
      disabled={quickActionDisabled}
      hitSlop={8}
      onPress={() => quickAction(medication)}
      style={[
        styles.deleteButton,
        {
          backgroundColor: `${theme.danger}12`,
          borderColor: `${theme.danger}30`,
          opacity: actionLoading ? 0.5 : 1,
        },
      ]}>
      <AppIcon name={{ ios: 'trash', android: 'delete' }} color={theme.danger} size={18} />
    </AnimatedPressable>
  ) : null;

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
          <Animated.View key={isActive ? 'active-state' : 'archived-state'} entering={STATE_FADE}>
            {!medication.is_active ? (
              <StatusPill label="Archivado" tone="warning" compact />
            ) : null}
            {deleteAction}
          </Animated.View>
        )}
      />

      {medication.instructions ? (
        <View style={[styles.instructions, { backgroundColor: theme.background }]}>
          <AppIcon name={{ ios: 'info.circle', android: 'info' }} color={theme.textSecondary} size={17} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.instructionsText}>{medication.instructions}</ThemedText>
        </View>
      ) : null}

      {medication.is_active ? (
        <Animated.View key="active-actions" entering={STATE_FADE} style={[styles.actions, { borderTopColor: theme.border }]}>
          <Link href={`/medicamentos/${medication.id}` as Href} asChild>
            <AnimatedPressable
              accessibilityRole="button"
              accessibilityLabel={`Editar ${medication.name}`}
              style={StyleSheet.flatten([
                styles.actionButton,
                { backgroundColor: theme.primarySoft, borderColor: theme.primary },
              ])}>
              <AppIcon name={{ ios: 'pencil', android: 'edit' }} color={theme.primary} size={17} />
              <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.primary }}>Editar</ThemedText>
            </AnimatedPressable>
          </Link>
        </Animated.View>
      ) : onRestore ? (
        <Animated.View key="restore-action" entering={STATE_FADE}>
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel={`Restaurar ${medication.name}`}
            accessibilityState={{ disabled: actionLoading, busy: actionLoading }}
            disabled={actionLoading}
            onPress={() => onRestore(medication)}
            style={[
              styles.restoreButton,
              { backgroundColor: theme.primarySoft, borderColor: theme.primary, opacity: actionLoading ? 0.5 : 1 },
            ]}>
            <AppIcon name={{ ios: 'archivebox', android: 'unarchive' }} color={theme.primary} size={18} />
            <ThemedText type="smallBold" numberOfLines={1} style={[styles.actionText, { color: theme.primary }]}>
              {actionLoading ? 'Restaurando…' : 'Restaurar medicamento'}
            </ThemedText>
          </AnimatedPressable>
        </Animated.View>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.four },
  deleteButton: { alignItems: 'center', borderRadius: 12, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  instructions: { alignItems: 'flex-start', borderRadius: 12, flexDirection: 'row', gap: Spacing.two, padding: Spacing.three },
  instructionsText: { flex: 1 },
  actions: { borderTopWidth: 1, flexDirection: 'row', gap: Spacing.two, paddingTop: Spacing.four },
  actionButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 46, paddingHorizontal: 10 },
  restoreButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48, paddingHorizontal: 12 },
  actionText: { flexShrink: 1 },
});
