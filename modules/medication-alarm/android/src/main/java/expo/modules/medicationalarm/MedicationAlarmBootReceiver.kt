package expo.modules.medicationalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Reprograrna las alarmas tras reinicios y cambios de hora/zona horaria.
 *
 * Android 15+ restringe el arranque de Foreground Services de tipo
 * mediaPlayback desde BOOT_COMPLETED, por lo que aquí nunca se inicia el
 * servicio. Las alarmas futuras se reprograman con AlarmManager y el receptor
 * de la alarma es quien inicia el flujo en el momento previsto. Las alarmas
 * vencidas se conservan como activas y se avisan con una notificación genérica
 * (sin datos del medicamento) para que se recuperen al abrir la app y validar
 * la sesión.
 */
class MedicationAlarmBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val supportedActions = setOf(
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_DATE_CHANGED,
      AlarmScheduler.ACTION_EXACT_ALARM_PERMISSION_CHANGED,
    )
    if (intent.action !in supportedActions) return

    AlarmStore.purgeUnscoped(context).forEach { AlarmScheduler.cancelLegacy(context, it) }

    val canScheduleExact = AlarmScheduler.canScheduleExactAlarms(context)
    val now = System.currentTimeMillis()
    var overdue = 0

    AlarmStore.scheduled(context).forEach { record ->
      if (record.triggerAtMillis > now) {
        if (canScheduleExact) {
          runCatching { AlarmScheduler.schedule(context, record) }
            .onFailure { Log.e(TAG, "No se pudo reprogramar ${record.occurrenceId}", it) }
        }
      } else {
        // Se conserva como activa para que la app la valide y recupere cuando
        // el usuario vuelva a abrirla con una sesión comprobada.
        AlarmStore.activateScheduled(context, record.occurrenceId)
        overdue += 1
      }
    }

    if (overdue > 0) {
      // Nunca se muestran datos del medicamento desde un receptor de arranque:
      // la sesión todavía no fue validada contra Supabase.
      runCatching { MedicationAlarmNotification.showRecovery(context) }
        .onFailure { Log.e(TAG, "No se pudo mostrar la recuperación de alarmas", it) }
    }
  }

  private companion object {
    const val TAG = "MedicationAlarmBoot"
  }
}
