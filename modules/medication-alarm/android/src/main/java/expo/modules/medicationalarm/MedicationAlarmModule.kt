package expo.modules.medicationalarm

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

    AsyncFunction("scheduleAlarm") { occurrenceId: String, userId: String, triggerAtMillis: Double, title: String, dose: String?, scheduledAt: String, timezone: String ->
      purgeLegacy()
      // Cierra la carrera entre el cierre de sesión y una reconciliación que
      // todavía estaba en curso.
      if (AlarmStore.authorizedUser(context) != userId) {
        throw IllegalStateException("USER_NOT_AUTHORIZED")
      }
      val record = AlarmRecord(occurrenceId, userId, triggerAtMillis.toLong(), title, dose, scheduledAt, timezone)
      AlarmScheduler.schedule(context, record)
      true
    }

    AsyncFunction("cancelAlarm") { occurrenceId: String, userId: String ->
      purgeLegacy()
      AlarmScheduler.cancel(context, occurrenceId)
      AlarmStore.removeScheduled(context, occurrenceId, userId)
      AlarmStore.removeActive(context, occurrenceId, userId)
      if (AlarmStore.serviceUser(context) == userId) {
        val stopIntent = AlarmIntents.serviceIntent(context, AlarmIntents.ACTION_STOP_SERVICE)
          .putExtra(AlarmIntents.EXTRA_USER_ID, userId)
        runCatching { context.startService(stopIntent) }
      }
      true
    }

    AsyncFunction("getScheduledAlarms") { userId: String ->
      purgeLegacy()
      AlarmStore.allForUser(context, userId).map { (record, active) -> record.toMap(active) }
    }

    AsyncFunction("getActiveAlarms") { userId: String ->
      purgeLegacy()
      AlarmStore.activeForUser(context, userId).map { record -> record.toMap(true) }
    }

    AsyncFunction("resumeActiveAlarms") { userId: String ->
      purgeLegacy()
      if (AlarmStore.authorizedUser(context) != userId) {
        false
      } else {
        val record = AlarmStore.activeForUser(context, userId).firstOrNull()
        if (record == null) {
          false
        } else {
          val serviceIntent = AlarmIntents.serviceIntent(context, AlarmIntents.ACTION_START_SERVICE, record)
          runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(serviceIntent) else context.startService(serviceIntent)
          }.isSuccess
        }
      }
    }

    AsyncFunction("clearUserAlarms") { userId: String ->
      purgeLegacy()
      val removed = AlarmStore.clearUser(context, userId)
      removed.forEach { record ->
        runCatching { AlarmScheduler.cancel(context, record.occurrenceId) }
          .onFailure { android.util.Log.e("MedicationAlarm", "No se pudo cancelar ${record.occurrenceId}", it) }
      }
      // El servicio no puede mostrar datos de otro usuario durante el cambio
      // de sesión. Sus registros de otros usuarios se conservan.
      context.stopService(Intent(context, MedicationAlarmService::class.java))
      MedicationAlarmNotification.cancel(context)
      true
    }

    AsyncFunction("setAuthorizedUser") { userId: String ->
      purgeLegacy()
      AlarmStore.setAuthorizedUser(context, userId)
      true
    }

    AsyncFunction("clearAuthorizedUser") { userId: String ->
      AlarmStore.clearAuthorizedUser(context, userId)
      true
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
    "userId" to userId,
    "triggerAtMillis" to triggerAtMillis,
    "title" to title,
    "dose" to dose,
    "scheduledAt" to scheduledAt,
    "timezone" to timezone,
    "active" to active,
    "armed" to armed,
  )

  private fun purgeLegacy() {
    AlarmStore.purgeUnscoped(context).forEach { AlarmScheduler.cancelLegacy(context, it) }
  }

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
