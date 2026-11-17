package expo.modules.medicationalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

class MedicationAlarmService : Service() {
  companion object {
    private const val CHANNEL_ID = "medication-alerts"
    private const val NOTIFICATION_ID = 74_920
    private val VIBRATION_PATTERN = longArrayOf(0L, 850L, 550L)
  }

  private var mediaPlayer: MediaPlayer? = null
  private var vibrator: Vibrator? = null

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      AlarmIntents.ACTION_START_SERVICE -> {
        val occurrenceId = intent.getStringExtra(AlarmIntents.EXTRA_OCCURRENCE_ID)
        if (occurrenceId != null) {
          AlarmStore.findScheduled(this, occurrenceId)?.let { AlarmStore.markActive(this, it) }
        }
        if (!startForegroundSafely()) return START_NOT_STICKY
        startAlert()
      }
      AlarmIntents.ACTION_STOP_SERVICE -> {
        if (AlarmStore.active(this).isEmpty()) stopAlertAndSelf()
        else updateNotification()
      }
      null -> {
        if (AlarmStore.active(this).isEmpty()) stopAlertAndSelf()
        else if (startForegroundSafely()) startAlert()
      }
    }
    return START_STICKY
  }

  private fun startForegroundSafely(): Boolean {
    return try {
      val notification = buildNotification()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      true
    } catch (_: SecurityException) {
      stopSelf()
      false
    }
  }

  private fun startAlert() {
    if (mediaPlayer == null) {
      mediaPlayer = createAlarmPlayer()
      mediaPlayer?.start()
    }

    if (vibrator == null) {
      vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        getSystemService(VibratorManager::class.java)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
    }
    vibrator?.let { deviceVibrator ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        deviceVibrator.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, 0))
      } else {
        @Suppress("DEPRECATION") deviceVibrator.vibrate(VIBRATION_PATTERN, 0)
      }
    }
    updateNotification()
  }

  private fun createAlarmPlayer(): MediaPlayer? {
    val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
      ?: return null

    return runCatching {
      MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        setDataSource(this@MedicationAlarmService, alarmUri)
        isLooping = true
        prepare()
      }
    }.getOrNull()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    val audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val channel = NotificationChannel(CHANNEL_ID, "Alarmas de medicamentos", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Recordatorios de medicamentos que requieren confirmación"
      enableVibration(true)
      vibrationPattern = VIBRATION_PATTERN
      setSound(alarmUri, audioAttributes)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val active = AlarmStore.active(this)
    val current = active.firstOrNull()
    val title = current?.title ?: "Alarma de medicamento"
    val text = if (active.size > 1) "Tienes ${active.size} alarmas de medicamentos activas" else listOfNotNull(current?.dose, current?.scheduledAt).joinToString(" · ").ifBlank { "Confirma la toma para detener la alarma" }
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      data = buildAlarmUri(current)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(this, AlarmIntents.requestCode(current?.occurrenceId ?: "active"), it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID) else Notification.Builder(this)
    return builder
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setColor(Color.rgb(15, 118, 110))
      .setContentTitle(title)
      .setContentText(text)
      .setCategory(Notification.CATEGORY_ALARM)
      .setPriority(Notification.PRIORITY_MAX)
      .setOngoing(true)
      .setAutoCancel(false)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setWhen(current?.triggerAtMillis ?: System.currentTimeMillis())
      .setFullScreenIntent(contentIntent, true)
      .setContentIntent(contentIntent)
      .build()
  }

  private fun buildAlarmUri(record: AlarmRecord?): Uri? {
    val builder = Uri.Builder().scheme("medirecord").authority("alarma")
    record?.let {
      builder.appendQueryParameter("occurrenceId", it.occurrenceId)
      builder.appendQueryParameter("medicationName", it.title)
      it.dose?.let { dose -> builder.appendQueryParameter("dose", dose) }
      builder.appendQueryParameter("scheduledAt", it.scheduledAt)
    }
    return builder.build()
  }

  private fun updateNotification() {
    getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, buildNotification())
  }

  private fun stopAlertAndSelf() {
    mediaPlayer?.runCatching { stop() }
    mediaPlayer?.release()
    mediaPlayer = null
    vibrator?.cancel()
    vibrator = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    stopAlertAndSelf()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
