package expo.modules.medicationalarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MedicationAlarmModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context unavailable" }

  override fun definition() = ModuleDefinition {
    Name("MedicationAlarm")

    AsyncFunction("scheduleAlarm") { occurrenceId: String, triggerAtMillis: Double, title: String, dose: String?, scheduledAt: String, timezone: String ->
      val record = AlarmRecord(occurrenceId, triggerAtMillis.toLong(), title, dose, scheduledAt, timezone)
      AlarmScheduler.schedule(context, record)
      true
    }

    AsyncFunction("cancelAlarm") { occurrenceId: String ->
      AlarmScheduler.cancel(context, occurrenceId)
      AlarmStore.removeScheduled(context, occurrenceId)
      AlarmStore.removeActive(context, occurrenceId)
      val stopIntent = AlarmIntents.serviceIntent(context, AlarmIntents.ACTION_STOP_SERVICE)
      context.startService(stopIntent)
      true
    }

    AsyncFunction("getScheduledAlarms") {
      AlarmStore.all(context).map { (record, active) -> record.toMap(active) }
    }

    AsyncFunction("getActiveAlarms") {
      AlarmStore.active(context).map { record -> record.toMap(true) }
    }

    AsyncFunction("resumeActiveAlarms") {
      val active = AlarmStore.active(context)
      val record = active.firstOrNull()
      if (record != null) {
        val serviceIntent = AlarmIntents.serviceIntent(context, AlarmIntents.ACTION_START_SERVICE, record)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(serviceIntent) else context.startService(serviceIntent)
      }
      record != null
    }

    AsyncFunction("getPermissionState") {
      val notificationManager = context.getSystemService(NotificationManager::class.java)
      val powerManager = context.getSystemService(PowerManager::class.java)
      mapOf(
        "notificationsEnabled" to (notificationManager?.areNotificationsEnabled() ?: false),
        "exactAlarmsAllowed" to AlarmScheduler.canScheduleExactAlarms(context),
        "fullScreenIntentAllowed" to if (Build.VERSION.SDK_INT >= 34) notificationManager?.canUseFullScreenIntent() ?: false else true,
        "batteryOptimizationExempt" to (powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: false),
      )
    }

    AsyncFunction("openNotificationSettings") { openSettings(Settings.ACTION_APP_NOTIFICATION_SETTINGS) }
    AsyncFunction("openExactAlarmSettings") { openSettings(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM) }
    AsyncFunction("openFullScreenIntentSettings") { openSettings(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT) }
    AsyncFunction("openBatterySettings") { openSettings(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS, null) }
  }

  private fun AlarmRecord.toMap(active: Boolean) = mapOf(
    "occurrenceId" to occurrenceId,
    "triggerAtMillis" to triggerAtMillis,
    "title" to title,
    "dose" to dose,
    "scheduledAt" to scheduledAt,
    "timezone" to timezone,
    "active" to active,
  )

  private fun openSettings(action: String, data: Uri? = Uri.parse("package:${context.packageName}")): Boolean {
    val intent = Intent(action).apply {
      if (data != null) this.data = data
      putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    return runCatching {
      context.startActivity(intent)
      true
    }.getOrDefault(false)
  }
}
