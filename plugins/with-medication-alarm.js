const { withAndroidManifest } = require('@expo/config-plugins');

const PERMISSIONS = [
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.SCHEDULE_EXACT_ALARM',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.VIBRATE',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.USE_FULL_SCREEN_INTENT',
];

const SERVICE_NAME = 'expo.modules.medicationalarm.MedicationAlarmService';
const ALARM_RECEIVER_NAME = 'expo.modules.medicationalarm.MedicationAlarmReceiver';
const BOOT_RECEIVER_NAME = 'expo.modules.medicationalarm.MedicationAlarmBootReceiver';

function findByName(entries, name) {
  return entries.find((entry) => entry?.$?.['android:name'] === name);
}

function withMedicationAlarm(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const manifest = configWithManifest.modResults.manifest;
    const existingPermissions = manifest['uses-permission'] ?? [];
    manifest['uses-permission'] = existingPermissions;

    for (const permission of PERMISSIONS) {
      if (!existingPermissions.some((entry) => entry?.$?.['android:name'] === permission)) {
        existingPermissions.push({ $: { 'android:name': permission } });
      }
    }

    const application = manifest.application?.[0] ?? { $: {}, service: [], receiver: [] };
    manifest.application = [application];
    application.service = application.service ?? [];
    application.receiver = application.receiver ?? [];
    application.activity = application.activity ?? [];

    // La notificación de pantalla completa debe poder encender y mostrar la
    // actividad sobre la pantalla de bloqueo cuando Android lo permita.
    const mainActivity = application.activity[0];
    if (mainActivity?.$) {
      mainActivity.$['android:showWhenLocked'] = 'true';
      mainActivity.$['android:turnScreenOn'] = 'true';
    }

    if (!findByName(application.service, SERVICE_NAME)) {
      application.service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'mediaPlayback',
        },
      });
    }

    if (!findByName(application.receiver, ALARM_RECEIVER_NAME)) {
      application.receiver.push({
        $: {
          'android:name': ALARM_RECEIVER_NAME,
          'android:enabled': 'true',
          'android:exported': 'false',
        },
      });
    }

    if (!findByName(application.receiver, BOOT_RECEIVER_NAME)) {
      application.receiver.push({
        $: {
          'android:name': BOOT_RECEIVER_NAME,
          'android:enabled': 'true',
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
              { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
            ],
          },
        ],
      });
    }

    return configWithManifest;
  });
}

module.exports = withMedicationAlarm;
