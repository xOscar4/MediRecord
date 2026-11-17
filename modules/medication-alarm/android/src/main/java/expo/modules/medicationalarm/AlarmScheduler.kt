package expo.modules.medicationalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import android.util.Log

internal object AlarmScheduler {
  const val ACTION_EXACT_ALARM_PERMISSION_CHANGED =
    "android.app.action.SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED"

  fun canScheduleExactAlarms(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return alarmManager.canScheduleExactAlarms()
  }

  fun schedule(context: Context, record: AlarmRecord) {
    require(record.occurrenceId.isNotBlank() && record.userId.isNotBlank())
    if (!canScheduleExactAlarms(context)) {
      throw IllegalStateException("EXACT_ALARM_PERMISSION_REQUIRED")
    }
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    cancel(context, record.occurrenceId)
    val triggerAt = maxOf(record.triggerAtMillis, System.currentTimeMillis() + 1_000L)
    val storedRecord = record.copy(triggerAtMillis = triggerAt, armed = false)
    // Se persiste sincrónicamente antes de que el receptor pueda depender del
    // registro. Si el registro falla, nunca se programa la alarma.
    AlarmStore.upsertScheduled(context, storedRecord)
    val pendingIntent = AlarmIntents.alarmPendingIntent(
      context,
      record.occurrenceId,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    try {
      alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
    } catch (error: Exception) {
      runCatching { AlarmStore.removeScheduled(context, storedRecord.occurrenceId, storedRecord.userId) }
      throw error
    }
    // `armed` solo evita reprogramar lo que ya está programado. Si no se
    // puede escribir, la alarma sigue siendo válida y la reconciliación la
    // volverá a programar más adelante.
    runCatching { AlarmStore.markArmed(context, storedRecord.occurrenceId, storedRecord.userId) }
      .onFailure { Log.w("AlarmScheduler", "No se pudo marcar armed para ${storedRecord.occurrenceId}", it) }
  }

  fun cancel(context: Context, occurrenceId: String) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pendingIntent = AlarmIntents.alarmPendingIntent(
      context,
      occurrenceId,
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
    )
    if (pendingIntent != null) {
      alarmManager.cancel(pendingIntent)
      pendingIntent.cancel()
    }
  }

  fun cancelLegacy(context: Context, occurrenceId: String) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pendingIntent = AlarmIntents.legacyAlarmPendingIntent(
      context,
      occurrenceId,
      PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
    )
    if (pendingIntent != null) {
      alarmManager.cancel(pendingIntent)
      pendingIntent.cancel()
    }
  }
}
