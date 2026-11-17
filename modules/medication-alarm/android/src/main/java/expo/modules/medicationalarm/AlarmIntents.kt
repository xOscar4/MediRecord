package expo.modules.medicationalarm

import android.app.PendingIntent
import android.content.Context
import android.content.Intent

internal object AlarmIntents {
  const val ACTION_TRIGGER = "expo.modules.medicationalarm.TRIGGER"
  const val ACTION_START_SERVICE = "expo.modules.medicationalarm.START_SERVICE"
  const val ACTION_STOP_SERVICE = "expo.modules.medicationalarm.STOP_SERVICE"
  const val EXTRA_OCCURRENCE_ID = "occurrenceId"
  const val EXTRA_TRIGGER_AT = "triggerAtMillis"
  const val EXTRA_TITLE = "title"
  const val EXTRA_DOSE = "dose"
  const val EXTRA_SCHEDULED_AT = "scheduledAt"
  const val EXTRA_TIMEZONE = "timezone"

  fun requestCode(occurrenceId: String): Int = occurrenceId.hashCode() and 0x7fffffff

  fun alarmPendingIntent(context: Context, occurrenceId: String, flags: Int): PendingIntent {
    val intent = Intent(context, MedicationAlarmReceiver::class.java)
      .setAction(ACTION_TRIGGER)
      .putExtra(EXTRA_OCCURRENCE_ID, occurrenceId)
    return PendingIntent.getBroadcast(context, requestCode(occurrenceId), intent, flags)
  }

  fun serviceIntent(context: Context, action: String, record: AlarmRecord? = null): Intent {
    return Intent(context, MedicationAlarmService::class.java).setAction(action).apply {
      if (record != null) {
        putExtra(EXTRA_OCCURRENCE_ID, record.occurrenceId)
        putExtra(EXTRA_TRIGGER_AT, record.triggerAtMillis)
        putExtra(EXTRA_TITLE, record.title)
        putExtra(EXTRA_DOSE, record.dose)
        putExtra(EXTRA_SCHEDULED_AT, record.scheduledAt)
        putExtra(EXTRA_TIMEZONE, record.timezone)
      }
    }
  }
}
