import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  activateReminderPermissions,
  openReminderSetting,
  readReminderPermissions,
  requestNotificationPermission,
  type ReminderActivationResult,
  type ReminderPermissionSnapshot,
  type ReminderSettingKind,
} from '@/lib/reminder-permissions';

const INITIAL_STATE: ReminderPermissionSnapshot = {
  supported: false,
  loaded: false,
  notificationsGranted: false,
  notificationsEnabled: false,
  notificationsReady: false,
  canAskNotifications: false,
  exactAlarmsAllowed: false,
  fullScreenIntentAllowed: false,
  batteryOptimizationExempt: false,
  nativeChannelExists: false,
  configuredChannelExists: false,
  ready: false,
};

/**
 * Estado verificado de los permisos que usa el sistema de alarmas nativo.
 * Se reconsulta al entrar en la pantalla y cada vez que la app vuelve de
 * Ajustes, porque Android no notifica de forma fiable estos cambios.
 */
export function useReminderPermissions() {
  const [state, setState] = useState<ReminderPermissionSnapshot>(INITIAL_STATE);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const next = await readReminderPermissions();
    if (mountedRef.current) setState(next);
    return next;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') void refresh();
    });
    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [refresh]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const requestNotifications = useCallback(async () => {
    try {
      return await requestNotificationPermission();
    } finally {
      await refresh();
    }
  }, [refresh]);

  const openSetting = useCallback(async (kind: ReminderSettingKind) => {
    await openReminderSetting(kind);
    return refresh();
  }, [refresh]);

  const activate = useCallback(async (): Promise<ReminderActivationResult> => {
    const result = await activateReminderPermissions();
    await refresh();
    return result;
  }, [refresh]);

  return { state, refresh, requestNotifications, openSetting, activate };
}
