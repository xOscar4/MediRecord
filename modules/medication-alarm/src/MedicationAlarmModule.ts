import { requireOptionalNativeModule, type NativeModule } from 'expo';

export type NativeAlarmRecord = {
  occurrenceId: string;
  userId: string;
  triggerAtMillis: number;
  title: string;
  dose: string | null;
  scheduledAt: string;
  timezone: string;
  active: boolean;
  armed: boolean;
};

export type NativeAlarmPermissionState = {
  notificationsEnabled: boolean;
  exactAlarmsAllowed: boolean;
  fullScreenIntentAllowed: boolean;
  batteryOptimizationExempt: boolean;
};

type MedicationAlarmNativeModule = NativeModule & {
  scheduleAlarm(
    occurrenceId: string,
    userId: string,
    triggerAtMillis: number,
    title: string,
    dose: string | null,
    scheduledAt: string,
    timezone: string,
  ): Promise<boolean>;
  cancelAlarm(occurrenceId: string, userId: string): Promise<boolean>;
  getScheduledAlarms(userId: string): Promise<NativeAlarmRecord[]>;
  getActiveAlarms(userId: string): Promise<NativeAlarmRecord[]>;
  resumeActiveAlarms(userId: string): Promise<boolean>;
  clearUserAlarms(userId: string): Promise<boolean>;
  setAuthorizedUser(userId: string): Promise<boolean>;
  clearAuthorizedUser(userId: string): Promise<boolean>;
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
  scheduleAlarm: (input: {
    occurrenceId: string;
    userId: string;
    triggerAtMillis: number;
    title: string;
    dose: string | null;
    scheduledAt: string;
    timezone: string;
  }) => nativeModule?.scheduleAlarm(
    input.occurrenceId,
    input.userId,
    input.triggerAtMillis,
    input.title,
    input.dose,
    input.scheduledAt,
    input.timezone,
  ) ?? unavailable<boolean>(),
  cancelAlarm: (occurrenceId: string, userId: string) => nativeModule?.cancelAlarm(occurrenceId, userId) ?? unavailable<boolean>(),
  getScheduledAlarms: (userId: string) => nativeModule?.getScheduledAlarms(userId) ?? Promise.resolve([]),
  getActiveAlarms: (userId: string) => nativeModule?.getActiveAlarms(userId) ?? Promise.resolve([]),
  resumeActiveAlarms: (userId: string) => nativeModule?.resumeActiveAlarms(userId) ?? Promise.resolve(false),
  clearUserAlarms: (userId: string) => nativeModule?.clearUserAlarms(userId) ?? Promise.resolve(false),
  setAuthorizedUser: (userId: string) => nativeModule?.setAuthorizedUser(userId) ?? Promise.resolve(false),
  clearAuthorizedUser: (userId: string) => nativeModule?.clearAuthorizedUser(userId) ?? Promise.resolve(false),
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
