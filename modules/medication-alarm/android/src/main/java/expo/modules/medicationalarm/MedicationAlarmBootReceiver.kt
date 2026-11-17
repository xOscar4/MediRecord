package expo.modules.medicationalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class MedicationAlarmBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return

    val now = System.currentTimeMillis()
    val overdue = mutableListOf<AlarmRecord>()
    AlarmStore.scheduled(context).forEach { record ->
      if (record.triggerAtMillis > now) {
        if (AlarmScheduler.canScheduleExactAlarms(context)) {
          runCatching { AlarmScheduler.schedule(context, record) }
        }
      } else {
        AlarmStore.markActive(context, record)
        overdue += record
      }
    }

    overdue.firstOrNull()?.let { record ->
      val serviceIntent = AlarmIntents.serviceIntent(context, AlarmIntents.ACTION_START_SERVICE, record)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(serviceIntent) else context.startService(serviceIntent)
    }
  }
}
