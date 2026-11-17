import * as Notifications from 'expo-notifications';
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { ActionButton } from '@/components/form-controls';
import { AppIcon, FormSection, StatusPill } from '@/components/ui-kit';
import MedicationAlarm, { type NativeAlarmPermissionState } from '@modules/medication-alarm';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const EMPTY_STATE: NativeAlarmPermissionState = {
  notificationsEnabled: false,
  exactAlarmsAllowed: false,
  fullScreenIntentAllowed: false,
  batteryOptimizationExempt: false,
};

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
  const [state, setState] = useState<NativeAlarmPermissionState>(EMPTY_STATE);

  const refresh = useCallback(async () => {
    if (Platform.OS !== 'android' || !MedicationAlarm.available) return;
    setState(await MedicationAlarm.getPermissionState());
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  if (Platform.OS !== 'android' || !MedicationAlarm.available) return null;

  async function requestNotifications() {
    await Notifications.requestPermissionsAsync();
    await refresh();
  }

  return (
    <FormSection
      icon={{ ios: 'bell.badge.fill', android: 'notifications_active' }}
      title="Permisos de alarmas"
      description="Necesarios para recordatorios puntuales y persistentes.">
      <PermissionRow label="Notificaciones" description="Muestra la alarma persistente y su estado." allowed={state.notificationsEnabled} />
      <PermissionRow label="Alarmas exactas" description="Permite activar el recordatorio a la hora programada." allowed={state.exactAlarmsAllowed} />
      <PermissionRow label="Pantalla completa" description="Permite mostrar la alarma de forma visible cuando corresponde." allowed={state.fullScreenIntentAllowed} />
      <PermissionRow label="Batería" description="Android puede limitar procesos si aplica optimización agresiva." allowed={state.batteryOptimizationExempt} />
      {!state.notificationsEnabled ? <ActionButton label="Habilitar notificaciones" onPress={() => void requestNotifications()} tone="neutral" /> : null}
      {!state.notificationsEnabled ? <ActionButton label="Abrir ajustes de notificaciones" onPress={() => void MedicationAlarm.openNotificationSettings()} tone="neutral" /> : null}
      {!state.exactAlarmsAllowed ? <ActionButton label="Abrir alarmas y recordatorios" onPress={() => void MedicationAlarm.openExactAlarmSettings()} tone="neutral" /> : null}
      {!state.fullScreenIntentAllowed ? <ActionButton label="Abrir permiso de pantalla completa" onPress={() => void MedicationAlarm.openFullScreenIntentSettings()} tone="neutral" /> : null}
      {!state.batteryOptimizationExempt ? <ActionButton label="Revisar optimización de batería" onPress={() => void MedicationAlarm.openBatterySettings()} tone="neutral" /> : null}
      <ThemedText type="small" themeColor="textSecondary" style={styles.note}>Android y el fabricante pueden limitar alarmas, volumen, vibración o pantalla completa. MediRecord no puede anular esas restricciones.</ThemedText>
    </FormSection>
  );
}

const styles = StyleSheet.create({
  permissionRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  permissionIcon: { alignItems: 'center', borderRadius: Radius.sm, height: 36, justifyContent: 'center', width: 36 },
  permissionCopy: { flex: 1, gap: 2 },
  note: { lineHeight: 19 },
});
