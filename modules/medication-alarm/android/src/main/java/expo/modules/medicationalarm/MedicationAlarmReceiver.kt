package expo.modules.medicationalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class MedicationAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != AlarmIntents.ACTION_TRIGGER) return
    AlarmStore.purgeUnscoped(context).forEach { AlarmScheduler.cancelLegacy(context, it) }
    val occurrenceId = intent.getStringExtra(AlarmIntents.EXTRA_OCCURRENCE_ID) ?: return
    val record = AlarmStore.activateScheduled(context, occurrenceId) ?: return

    // La cuenta autorizada la valida JavaScript contra Supabase. Si no
    // coincide, se conserva la ocurrencia para recuperarla después, pero no
    // se muestra ningún dato ni se inicia el servicio.
    if (AlarmStore.authorizedUser(context) != record.userId) {
      MedicationAlarmNotification.showRecovery(context)
      return
    }

    val serviceIntent = AlarmIntents.serviceIntent(context, AlarmIntents.ACTION_START_SERVICE, record)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(serviceIntent)
      } else {
        context.startService(serviceIntent)
      }
    } catch (error: Exception) {
      android.util.Log.e("MedicationAlarmReceiver", "No se pudo iniciar la alarma", error)
      MedicationAlarmNotification.showRecovery(context, record)
    }
  }
}
