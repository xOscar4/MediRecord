package expo.modules.medicationalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build

internal object MedicationAlarmNotification {
  const val CHANNEL_ID = "medication-alerts-native"
  const val NOTIFICATION_ID = 74_920

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Alarmas de medicamentos",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Recordatorios de medicamentos que requieren confirmación"
      // El audio y la vibración persistentes los controla el servicio. El
      // canal no debe duplicarlos.
      setSound(null, null)
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
  }

  fun showRecovery(context: Context, record: AlarmRecord? = null) {
    ensureChannel(context)
    val notification = build(context, listOfNotNull(record), fullScreen = false, generic = record == null)
    context.getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, notification)
  }

  fun cancel(context: Context) {
    context.getSystemService(NotificationManager::class.java)?.cancel(NOTIFICATION_ID)
  }

  fun build(context: Context, records: List<AlarmRecord>, fullScreen: Boolean, generic: Boolean = false): Notification {
    val current = records.firstOrNull()
    val title = if (generic) "Alarma de MediRecord" else current?.title ?: "Alarma de medicamento"
    val text = when {
      generic -> "Abre MediRecord para revisar tus alarmas pendientes"
      records.size > 1 -> "Tienes ${records.size} alarmas de medicamentos activas"
      else -> listOfNotNull(current?.dose, current?.scheduledAt)
        .joinToString(" · ")
        .ifBlank { "Confirma la toma para detener la alarma" }
    }
    val contentIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      data = buildAlarmUri(current)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }?.let { launchIntent ->
      PendingIntent.getActivity(
        context,
        0,
        launchIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      Notification.Builder(context)
    }

    return builder
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setColor(Color.rgb(15, 118, 110))
      .setContentTitle(title)
      .setContentText(text)
      .setCategory(Notification.CATEGORY_ALARM)
      .setPriority(Notification.PRIORITY_MAX)
      // Solo la alarma activa del servicio queda fija; la recuperación puede
      // descartarse por el usuario.
      .setOngoing(fullScreen)
      .setAutoCancel(!fullScreen)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setWhen(current?.triggerAtMillis ?: System.currentTimeMillis())
      .apply {
        if (fullScreen && contentIntent != null) setFullScreenIntent(contentIntent, true)
        if (contentIntent != null) setContentIntent(contentIntent)
      }
      .build()
  }

  private fun buildAlarmUri(record: AlarmRecord?): Uri {
    val builder = Uri.Builder().scheme("medirecord").authority("alarma")
    record?.let {
      builder.appendQueryParameter("occurrenceId", it.occurrenceId)
      builder.appendQueryParameter("medicationName", it.title)
      it.dose?.let { dose -> builder.appendQueryParameter("dose", dose) }
      builder.appendQueryParameter("scheduledAt", it.scheduledAt)
    }
    return builder.build()
  }
}
