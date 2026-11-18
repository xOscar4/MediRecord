import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionButton } from '@/components/form-controls';
import { AppIcon, FormSection, InlineMessage, StatusPill } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useReminderPermissions } from '@/hooks/use-reminder-permissions';
import { useTheme } from '@/hooks/use-theme';

function PermissionRow({ label, description, allowed }: { label: string; description: string; allowed: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.permissionRow}>
      <View style={[styles.permissionIcon, { backgroundColor: allowed ? `${theme.success}20` : `${theme.warning}20` }]}>
        <AppIcon name={{ ios: allowed ? 'checkmark' : 'exclamationmark.triangle', android: allowed ? 'check' : 'warning' }} color={allowed ? theme.success : theme.warning} size={18} />
      </View>
      <View style={styles.permissionCopy}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">{description}</ThemedText>
      </View>
      <StatusPill label={allowed ? 'Listo' : 'Revisar'} tone={allowed ? 'success' : 'warning'} compact />
    </View>
  );
}

export function AlarmPermissionSettings() {
  const { state, requestNotifications, openSetting } = useReminderPermissions();
  const [isRequestingNotifications, setIsRequestingNotifications] = useState(false);

  if (!state.supported) return null;

  const overallTone = !state.loaded ? 'neutral' : state.ready ? 'success' : 'warning';
  const overallLabel = !state.loaded ? 'Verificando' : state.ready ? 'Listo' : 'Revisar';

  async function handleRequestNotifications() {
    setIsRequestingNotifications(true);
    try {
      await requestNotifications();
    } finally {
      setIsRequestingNotifications(false);
    }
  }

  return (
    <FormSection
      icon={{ ios: 'bell.badge.fill', android: 'notifications_active' }}
      title="Recordatorios"
      description="Estado verificado de lo que tu teléfono necesita para avisarte a la hora elegida.">
      <View style={styles.overallRow}>
        <ThemedText type="smallBold">Estado general</ThemedText>
        <StatusPill label={overallLabel} tone={overallTone} compact />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {!state.loaded
          ? 'Estamos comprobando los permisos reales del dispositivo…'
          : state.ready
            ? 'Los avisos están listos para funcionar con tus horarios.'
            : 'Faltan opciones por activar. Tus horarios se guardan igual, pero algunos avisos podrían no llegar.'}
      </ThemedText>

      <PermissionRow
        label="Notificaciones"
        description="Para ver y escuchar el aviso de la toma."
        allowed={state.notificationsReady}
      />
      <PermissionRow
        label="Alarmas y recordatorios exactos"
        description="Para que el aviso llegue a la hora elegida."
        allowed={state.exactAlarmsAllowed}
      />
      <PermissionRow
        label="Aviso en pantalla"
        description="Para mostrar la alarma si el teléfono está bloqueado."
        allowed={state.fullScreenIntentAllowed}
      />

      <ThemedText type="small" themeColor="textSecondary">
        Canal de avisos: {state.nativeChannelExists ? 'disponible en este dispositivo.' : 'se creará al programar el primer recordatorio.'}
      </ThemedText>

      {!state.notificationsReady ? (
        <>
          {!state.notificationsGranted && state.canAskNotifications ? (
            <ActionButton label="Habilitar notificaciones" onPress={() => void handleRequestNotifications()} tone="neutral" loading={isRequestingNotifications} />
          ) : null}
          <ActionButton label="Abrir ajustes de notificaciones" onPress={() => void openSetting('notifications')} tone="neutral" />
        </>
      ) : null}
      {!state.exactAlarmsAllowed ? (
        <ActionButton label="Abrir alarmas y recordatorios" onPress={() => void openSetting('exactAlarms')} tone="neutral" />
      ) : null}
      {!state.fullScreenIntentAllowed ? (
        <ActionButton label="Permitir aviso en pantalla" onPress={() => void openSetting('fullScreen')} tone="neutral" />
      ) : null}

      <InlineMessage tone="info">
        {state.batteryOptimizationExempt
          ? 'La optimización de batería no está limitando MediRecord en este momento.'
          : 'Algunos fabricantes limitan los avisos con la optimización de batería. No es obligatorio cambiar esa opción; solo tenla en cuenta si un recordatorio no llega.'}
      </InlineMessage>
      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
        Después de cambiar algo en Ajustes, vuelve a esta pantalla: volveremos a comprobar el estado real.
      </ThemedText>
    </FormSection>
  );
}

const styles = StyleSheet.create({
  overallRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two, justifyContent: 'space-between' },
  permissionRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  permissionIcon: { alignItems: 'center', borderRadius: Radius.sm, height: 36, justifyContent: 'center', width: 36 },
  permissionCopy: { flex: 1, gap: 2 },
  note: { lineHeight: 19 },
});
