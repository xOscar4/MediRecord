package expo.modules.medicationalarm

import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

class MedicationAlarmService : Service() {
  companion object {
    private val VIBRATION_PATTERN = longArrayOf(0L, 850L, 550L)
  }

  private var mediaPlayer: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var serviceUserId: String? = null

  override fun onCreate() {
    super.onCreate()
    MedicationAlarmNotification.ensureChannel(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      AlarmIntents.ACTION_START_SERVICE -> {
        val occurrenceId = intent.getStringExtra(AlarmIntents.EXTRA_OCCURRENCE_ID)
        val userId = intent.getStringExtra(AlarmIntents.EXTRA_USER_ID)
        val record = if (occurrenceId != null && userId != null) {
          AlarmStore.findActive(this, occurrenceId, userId)
        } else null
        // Un START_SERVICE retrasado de una alarma ya cancelada no debe
        // reactivarla. Tampoco debe silenciar otra alarma válida que siga
        // activa, por eso solo se detiene cuando no queda nada que mostrar.
        if (record == null || userId == null || AlarmStore.authorizedUser(this) != userId) {
          stopIfNoCurrentAlarm()
          return START_NOT_STICKY
        }
        serviceUserId = userId
        runCatching { AlarmStore.setServiceUser(this, userId) }
          .onFailure { Log.e("MedicationAlarmService", "No se pudo marcar el usuario del servicio", it) }
        if (!startForegroundSafely()) return START_NOT_STICKY
        startAlert(userId)
      }
      AlarmIntents.ACTION_STOP_SERVICE -> {
        val requestedUserId = intent.getStringExtra(AlarmIntents.EXTRA_USER_ID)
        val owner = serviceUserId ?: AlarmStore.serviceUser(this)
        if (owner == null || requestedUserId == null || owner == requestedUserId) {
          if (owner == null || AlarmStore.activeForUser(this, owner).isEmpty()) stopAlertAndSelf()
          else updateNotification(owner)
        }
      }
      null -> {
        val owner = serviceUserId ?: AlarmStore.serviceUser(this)
        if (owner == null || AlarmStore.authorizedUser(this) != owner || AlarmStore.activeForUser(this, owner).isEmpty()) {
          stopAlertAndSelf()
        } else if (startForegroundSafely()) {
          serviceUserId = owner
          startAlert(owner)
        }
      }
    }
    return START_STICKY
  }

  private fun startForegroundSafely(): Boolean {
    return try {
      val owner = serviceUserId ?: AlarmStore.serviceUser(this) ?: return false
      val notification = MedicationAlarmNotification.build(
        this,
        AlarmStore.activeForUser(this, owner),
        fullScreen = true,
      )
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(MedicationAlarmNotification.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(MedicationAlarmNotification.NOTIFICATION_ID, notification)
      }
      true
    } catch (error: Exception) {
      Log.e("MedicationAlarmService", "No se pudo iniciar el foreground service", error)
      stopAlertAndSelf()
      false
    }
  }

  private fun stopIfNoCurrentAlarm() {
    val owner = serviceUserId ?: AlarmStore.serviceUser(this)
    val authorized = AlarmStore.authorizedUser(this)
    val keepRunning = owner != null
      && owner == authorized
      && AlarmStore.activeForUser(this, owner).isNotEmpty()
    if (!keepRunning) stopAlertAndSelf()
  }

  private fun startAlert(userId: String) {
    if (AlarmStore.authorizedUser(this) != userId || AlarmStore.activeForUser(this, userId).isEmpty()) {
      stopAlertAndSelf()
      return
    }
    if (mediaPlayer == null) {
      mediaPlayer = createAlarmPlayer()
      try {
        mediaPlayer?.start()
      } catch (error: Exception) {
        Log.e("MedicationAlarmService", "No se pudo iniciar el tono de alarma", error)
        mediaPlayer?.release()
        mediaPlayer = null
      }
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
    updateNotification(userId)
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

  private fun updateNotification(userId: String) {
    getSystemService(android.app.NotificationManager::class.java)?.notify(
      MedicationAlarmNotification.NOTIFICATION_ID,
      MedicationAlarmNotification.build(this, AlarmStore.activeForUser(this, userId), fullScreen = true),
    )
  }

  private fun stopAlertAndSelf() {
    mediaPlayer?.runCatching { stop() }
    mediaPlayer?.release()
    mediaPlayer = null
    vibrator?.cancel()
    vibrator = null
    MedicationAlarmNotification.cancel(this)
    AlarmStore.clearServiceUser(this)
    serviceUserId = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    stopAlertAndSelf()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
