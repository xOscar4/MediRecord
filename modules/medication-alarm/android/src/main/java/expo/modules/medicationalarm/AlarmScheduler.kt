package expo.modules.medicationalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build

internal object AlarmScheduler {
  fun canScheduleExactAlarms(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return alarmManager.canScheduleExactAlarms()
  }

  fun schedule(context: Context, record: AlarmRecord) {
    if (!canScheduleExactAlarms(context)) {
      throw IllegalStateException("EXACT_ALARM_PERMISSION_REQUIRED")
    }
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    cancel(context, record.occurrenceId)
    val pendingIntent = AlarmIntents.alarmPendingIntent(
      context,
      record.occurrenceId,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val triggerAt = maxOf(record.triggerAtMillis, System.currentTimeMillis() + 1_000L)
    alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
    AlarmStore.upsertScheduled(context, record.copy(triggerAtMillis = triggerAt))
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
}
