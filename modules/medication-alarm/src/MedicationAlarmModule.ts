import { requireOptionalNativeModule, type NativeModule } from 'expo';

export type NativeAlarmRecord = {
  occurrenceId: string;
  triggerAtMillis: number;
  title: string;
  dose: string | null;
  scheduledAt: string;
  timezone: string;
  active: boolean;
};

export type NativeAlarmPermissionState = {
  notificationsEnabled: boolean;
  exactAlarmsAllowed: boolean;
  fullScreenIntentAllowed: boolean;
  batteryOptimizationExempt: boolean;
};

type MedicationAlarmNativeModule = NativeModule & {
  scheduleAlarm(input: {
    occurrenceId: string;
    triggerAtMillis: number;
    title: string;
    dose: string | null;
    scheduledAt: string;
    timezone: string;
  }): Promise<boolean>;
  cancelAlarm(occurrenceId: string): Promise<boolean>;
  getScheduledAlarms(): Promise<NativeAlarmRecord[]>;
  getActiveAlarms(): Promise<NativeAlarmRecord[]>;
  resumeActiveAlarms(): Promise<boolean>;
  getPermissionState(): Promise<NativeAlarmPermissionState>;
  openNotificationSettings(): Promise<boolean>;
  openExactAlarmSettings(): Promise<boolean>;
  openFullScreenIntentSettings(): Promise<boolean>;
  openBatterySettings(): Promise<boolean>;
};

const nativeModule = requireOptionalNativeModule<MedicationAlarmNativeModule>('MedicationAlarm');

export const medicationAlarmNativeAvailable = nativeModule !== null;

function unavailable<T>(): Promise<T> {
  return Promise.reject(new Error('Las alarmas nativas no están disponibles en este dispositivo.'));
}

const MedicationAlarmModule = {
  available: medicationAlarmNativeAvailable,
  scheduleAlarm: (input: Parameters<MedicationAlarmNativeModule['scheduleAlarm']>[0]) => nativeModule?.scheduleAlarm(input) ?? unavailable<boolean>(),
  cancelAlarm: (occurrenceId: string) => nativeModule?.cancelAlarm(occurrenceId) ?? unavailable<boolean>(),
  getScheduledAlarms: () => nativeModule?.getScheduledAlarms() ?? Promise.resolve([]),
  getActiveAlarms: () => nativeModule?.getActiveAlarms() ?? Promise.resolve([]),
  resumeActiveAlarms: () => nativeModule?.resumeActiveAlarms() ?? Promise.resolve(false),
  getPermissionState: () => nativeModule?.getPermissionState() ?? Promise.resolve({
    notificationsEnabled: false,
    exactAlarmsAllowed: false,
    fullScreenIntentAllowed: false,
    batteryOptimizationExempt: false,
  }),
  openNotificationSettings: () => nativeModule?.openNotificationSettings() ?? Promise.resolve(false),
  openExactAlarmSettings: () => nativeModule?.openExactAlarmSettings() ?? Promise.resolve(false),
  openFullScreenIntentSettings: () => nativeModule?.openFullScreenIntentSettings() ?? Promise.resolve(false),
  openBatterySettings: () => nativeModule?.openBatterySettings() ?? Promise.resolve(false),
};

export default MedicationAlarmModule;
