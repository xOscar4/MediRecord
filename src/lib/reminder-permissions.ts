import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

import MedicationAlarm from '@modules/medication-alarm';

/**
 * Canal usado por el módulo nativo (`MedicationAlarmNotification.CHANNEL_ID`).
 * `medication-alerts` es el canal declarado en `app.json` y se comprueba también
 * para detectar configuraciones huérfanas, pero no programa alarmas.
 */
const NATIVE_CHANNEL_ID = 'medication-alerts-native';
const CONFIGURED_CHANNEL_ID = 'medication-alerts';
const PROMPT_STORAGE_KEY = 'medirecord.reminder-permission-prompt';
const PROMPT_STORAGE_VALUE = 'seen';

/** Evita repetir el modal durante la misma sesión si la persistencia falla. */
let promptShownInThisSession = false;

export type ReminderPermissionSnapshot = {
  supported: boolean;
  loaded: boolean;
  /** Permiso de notificaciones informado por la API oficial de Expo. */
  notificationsGranted: boolean;
  /** Estado real del sistema comprobado por el módulo nativo. */
  notificationsEnabled: boolean;
  notificationsReady: boolean;
  canAskNotifications: boolean;
  exactAlarmsAllowed: boolean;
  fullScreenIntentAllowed: boolean;
  batteryOptimizationExempt: boolean;
  nativeChannelExists: boolean;
  configuredChannelExists: boolean;
  ready: boolean;
};

export type ReminderSettingKind = 'notifications' | 'exactAlarms' | 'fullScreen';

export type ReminderActivationResult = {
  snapshot: ReminderPermissionSnapshot;
  opened: ReminderSettingKind | null;
};

const UNSUPPORTED_SNAPSHOT: ReminderPermissionSnapshot = {
  supported: false,
  loaded: false,
  notificationsGranted: false,
  notificationsEnabled: false,
  notificationsReady: true,
  canAskNotifications: false,
  exactAlarmsAllowed: true,
  fullScreenIntentAllowed: true,
  batteryOptimizationExempt: false,
  nativeChannelExists: true,
  configuredChannelExists: true,
  ready: true,
};

function snapshotFrom(values: Partial<ReminderPermissionSnapshot>): ReminderPermissionSnapshot {
  const notificationsGranted = values.notificationsGranted ?? false;
  const notificationsEnabled = values.notificationsEnabled ?? false;
  const notificationsReady = notificationsGranted && notificationsEnabled;
  const exactAlarmsAllowed = values.exactAlarmsAllowed ?? false;
  const fullScreenIntentAllowed = values.fullScreenIntentAllowed ?? false;

  return {
    supported: true,
    loaded: true,
    notificationsGranted,
    notificationsEnabled,
    notificationsReady,
    canAskNotifications: values.canAskNotifications ?? false,
    exactAlarmsAllowed,
    fullScreenIntentAllowed,
    batteryOptimizationExempt: values.batteryOptimizationExempt ?? false,
    nativeChannelExists: values.nativeChannelExists ?? false,
    configuredChannelExists: values.configuredChannelExists ?? false,
    ready: notificationsReady && exactAlarmsAllowed && fullScreenIntentAllowed,
  };
}

function unsupportedSnapshot(): ReminderPermissionSnapshot {
  return { ...UNSUPPORTED_SNAPSHOT, loaded: true };
}

async function loadNotificationsModule() {
  if (Platform.OS !== 'android') return null;
  return import('expo-notifications');
}

/**
 * Combina la comprobación oficial de permisos con la comprobación real del
 * sistema hecha por Kotlin. No solicita tokens push ni programa notificaciones.
 */
export async function readReminderPermissions(): Promise<ReminderPermissionSnapshot> {
  if (Platform.OS !== 'android' || !MedicationAlarm.available) return unsupportedSnapshot();

  try {
    const [nativeState, notifications] = await Promise.all([
      MedicationAlarm.getPermissionState(),
      loadNotificationsModule(),
    ]);

    let notificationsGranted = false;
    let canAskNotifications = false;
    let nativeChannelExists = false;
    let configuredChannelExists = false;

    if (notifications) {
      const [permission, nativeChannel, configuredChannel] = await Promise.all([
        notifications.getPermissionsAsync(),
        notifications.getNotificationChannelAsync(NATIVE_CHANNEL_ID),
        notifications.getNotificationChannelAsync(CONFIGURED_CHANNEL_ID),
      ]);
      notificationsGranted = permission.granted;
      canAskNotifications = permission.canAskAgain ?? false;
      nativeChannelExists = nativeChannel !== null && nativeChannel !== undefined;
      configuredChannelExists = configuredChannel !== null && configuredChannel !== undefined;
    }

    return snapshotFrom({
      notificationsGranted,
      notificationsEnabled: nativeState.notificationsEnabled,
      canAskNotifications,
      exactAlarmsAllowed: nativeState.exactAlarmsAllowed,
      fullScreenIntentAllowed: nativeState.fullScreenIntentAllowed,
      batteryOptimizationExempt: nativeState.batteryOptimizationExempt,
      nativeChannelExists,
      configuredChannelExists,
    });
  } catch (error) {
    console.warn('[MediRecord] No se pudieron comprobar los permisos de recordatorio', error);
    return snapshotFrom({});
  }
}

/** Usa solo la API oficial de notificaciones locales, uno a uno y sin push. */
export async function requestNotificationPermission(): Promise<ReminderPermissionSnapshot> {
  const current = await readReminderPermissions();
  if (!current.supported || current.notificationsGranted || !current.canAskNotifications) return current;

  const notifications = await loadNotificationsModule();
  if (notifications) await notifications.requestPermissionsAsync();
  return readReminderPermissions();
}

export async function openReminderSetting(kind: ReminderSettingKind): Promise<boolean> {
  if (Platform.OS !== 'android' || !MedicationAlarm.available) return false;
  try {
    if (kind === 'notifications') return await MedicationAlarm.openNotificationSettings();
    if (kind === 'exactAlarms') return await MedicationAlarm.openExactAlarmSettings();
    return await MedicationAlarm.openFullScreenIntentSettings();
  } catch (error) {
    console.warn('[MediRecord] No se pudo abrir el ajuste de recordatorios', kind, error);
    return false;
  }
}

/**
 * Pide notificaciones con el diálogo del sistema y abre, como máximo, una
 * pantalla de Ajustes por pulsación. El estado se vuelve a consultar al volver
 * de Ajustes desde el hook; nunca se asume que se concedió el permiso.
 */
export async function activateReminderPermissions(): Promise<ReminderActivationResult> {
  let snapshot = await requestNotificationPermission();
  if (!snapshot.supported || snapshot.ready) return { snapshot, opened: null };

  if (!snapshot.exactAlarmsAllowed) {
    const opened = await openReminderSetting('exactAlarms');
    if (opened) return { snapshot: await readReminderPermissions(), opened: 'exactAlarms' };
  }

  if (!snapshot.fullScreenIntentAllowed) {
    const opened = await openReminderSetting('fullScreen');
    if (opened) return { snapshot: await readReminderPermissions(), opened: 'fullScreen' };
  }

  if (!snapshot.notificationsReady) {
    const opened = await openReminderSetting('notifications');
    if (opened) return { snapshot: await readReminderPermissions(), opened: 'notifications' };
  }

  return { snapshot: await readReminderPermissions(), opened: null };
}

export async function hasSeenReminderPrompt(): Promise<boolean> {
  if (promptShownInThisSession) return true;
  try {
    return (await Storage.getItem(PROMPT_STORAGE_KEY)) === PROMPT_STORAGE_VALUE;
  } catch {
    return false;
  }
}

export async function markReminderPromptSeen(): Promise<void> {
  promptShownInThisSession = true;
  try {
    await Storage.setItem(PROMPT_STORAGE_KEY, PROMPT_STORAGE_VALUE);
  } catch {
    // El aviso sigue siendo único durante la sesión aunque falle la persistencia.
  }
}

export function describeOpenedReminderSetting(kind: ReminderSettingKind): string {
  if (kind === 'notifications') return 'Revisa las notificaciones en Ajustes y vuelve a MediRecord para comprobarlo.';
  if (kind === 'exactAlarms') return 'Revisa los recordatorios y alarmas en Ajustes y vuelve a MediRecord para comprobarlo.';
  return 'Revisa el aviso en pantalla en Ajustes y vuelve a MediRecord para comprobarlo.';
}
