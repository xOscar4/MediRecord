package expo.modules.medicationalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class MedicationAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != AlarmIntents.ACTION_TRIGGER) return
    val occurrenceId = intent.getStringExtra(AlarmIntents.EXTRA_OCCURRENCE_ID) ?: return
    val record = AlarmStore.findScheduled(context, occurrenceId) ?: return
    AlarmStore.markActive(context, record)

    val serviceIntent = AlarmIntents.serviceIntent(context, AlarmIntents.ACTION_START_SERVICE, record)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(serviceIntent)
    } else {
      context.startService(serviceIntent)
    }
  }
}
