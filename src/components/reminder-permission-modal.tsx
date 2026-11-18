import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';

import { ActionButton } from '@/components/form-controls';
import { AppIcon, InlineMessage, StatusPill } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ReminderPermissionSnapshot } from '@/lib/reminder-permissions';

const TITLE = 'Activa tus recordatorios';
const DESCRIPTION =
  'Para avisarte cuando llegue la hora de tomar tus medicamentos, necesitamos habilitar las notificaciones y los permisos de alarma de tu dispositivo.';

type ReminderPermissionModalProps = {
  visible: boolean;
  state: ReminderPermissionSnapshot;
  busy?: boolean;
  hint?: string | null;
  onActivate: () => void;
  onDismiss: () => void;
};

export function ReminderPermissionModal({
  visible,
  state,
  busy = false,
  hint = null,
  onActivate,
  onDismiss,
}: ReminderPermissionModalProps) {
  const theme = useTheme();

  const rows = [
    {
      label: 'Notificaciones',
      description: 'Para ver y escuchar el aviso.',
      allowed: state.notificationsReady,
    },
    {
      label: 'Alarmas y recordatorios exactos',
      description: 'Para que llegue a la hora elegida.',
      allowed: state.exactAlarmsAllowed,
    },
    {
      label: 'Aviso en pantalla',
      description: 'Para mostrarlo si el teléfono está bloqueado.',
      allowed: state.fullScreenIntentAllowed,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onDismiss}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar aviso de recordatorios"
        style={[styles.backdrop, { backgroundColor: theme.overlay }]}
        onPress={onDismiss}>
        <Pressable onPress={(event) => event.stopPropagation()} style={styles.cardWrapper}>
          <Animated.View
            entering={FadeInDown.duration(240).reduceMotion(ReduceMotion.System)}
            style={[
              styles.card,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border, boxShadow: theme.shadow },
            ]}>
            <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}>
              <AppIcon name={{ ios: 'bell.badge.fill', android: 'notifications_active' }} color={theme.primary} size={28} />
            </View>

            <ThemedText type="subtitle" style={styles.title}>{TITLE}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.description}>{DESCRIPTION}</ThemedText>

            <View style={styles.statusList}>
              {rows.map((row) => (
                <View key={row.label} style={styles.statusRow}>
                  <View style={[styles.statusIcon, { backgroundColor: row.allowed ? `${theme.success}20` : `${theme.warning}20` }]}>
                    <AppIcon
                      name={row.allowed
                        ? { ios: 'checkmark', android: 'check' }
                        : { ios: 'exclamationmark.triangle', android: 'warning' }}
                      color={row.allowed ? theme.success : theme.warning}
                      size={17}
                    />
                  </View>
                  <View style={styles.statusCopy}>
                    <ThemedText type="smallBold">{row.label}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{row.description}</ThemedText>
                  </View>
                  <StatusPill
                    label={row.allowed ? 'Listo' : 'Pendiente'}
                    tone={row.allowed ? 'success' : 'warning'}
                    compact
                  />
                </View>
              ))}
            </View>

            {state.ready ? (
              <InlineMessage tone="success">Todo listo. Tu hora quedó guardada y los recordatorios están activos.</InlineMessage>
            ) : (
              <InlineMessage tone="info">
                {hint ?? 'Si no los activas, tu hora se guarda igual, pero algunos recordatorios podrían no avisarte.'}
              </InlineMessage>
            )}

            <View style={styles.actions}>
              <ActionButton
                label="Activar permisos"
                onPress={onActivate}
                loading={busy}
                disabled={state.ready || busy}
              />
              <ActionButton
                label="Ahora no"
                onPress={onDismiss}
                tone="neutral"
                disabled={busy}
              />
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: Spacing.three },
  cardWrapper: { width: '100%', maxWidth: 460 },
  card: { borderWidth: 1, borderRadius: Radius.xl, gap: Spacing.three, padding: Spacing.four },
  icon: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: Radius.md, height: 50, justifyContent: 'center', width: 50 },
  title: { fontSize: 23, lineHeight: 28 },
  description: { lineHeight: 21 },
  statusList: { gap: Spacing.two },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  statusIcon: { alignItems: 'center', borderRadius: Radius.sm, height: 34, justifyContent: 'center', width: 34 },
  statusCopy: { flex: 1, gap: 2, minWidth: 0 },
  actions: { gap: Spacing.two, marginTop: Spacing.one },
});
