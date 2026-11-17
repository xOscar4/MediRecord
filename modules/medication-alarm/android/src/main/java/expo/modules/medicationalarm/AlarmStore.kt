package expo.modules.medicationalarm

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

internal object AlarmStore {
  private const val PREFS = "medication_alarm_store"
  private const val SCHEDULED_KEY = "scheduled"
  private const val ACTIVE_KEY = "active"
  private const val AUTHORIZED_USER_KEY = "authorizedUserId"
  private const val SERVICE_USER_KEY = "serviceUserId"
  private const val TAG = "MedicationAlarmStore"
  private val lock = Any()

  private fun preferences(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun read(context: Context, key: String): MutableList<AlarmRecord> {
    val result = mutableListOf<AlarmRecord>()
    try {
      val array = JSONArray(preferences(context).getString(key, "[]") ?: "[]")
      for (index in 0 until array.length()) {
        val item = array.optJSONObject(index) ?: continue
        val occurrenceId = item.optString("occurrenceId")
        val userId = item.optString("userId")
        // Registros de versiones anteriores no tienen usuario y nunca deben
        // reactivarse ni exponer sus datos.
        if (occurrenceId.isBlank() || userId.isBlank()) continue
        result += AlarmRecord(
          occurrenceId = occurrenceId,
          userId = userId,
          triggerAtMillis = item.optLong("triggerAtMillis", 0L),
          title = item.optString("title", "Medicamento"),
          dose = if (item.isNull("dose")) null else item.optString("dose"),
          scheduledAt = item.optString("scheduledAt", ""),
          timezone = item.optString("timezone", "UTC"),
          armed = item.optBoolean("armed", false),
        )
      }
    } catch (error: Exception) {
      Log.e(TAG, "No se pudo leer $key; se descarta el almacenamiento corrupto", error)
      val cleared = runCatching { preferences(context).edit().remove(key).commit() }.getOrDefault(false)
      if (!cleared) Log.e(TAG, "No se pudo limpiar $key después del error")
    }
    return result
  }

  private fun write(context: Context, key: String, records: List<AlarmRecord>) {
    val array = JSONArray()
    records.forEach { record ->
      array.put(JSONObject().apply {
        put("occurrenceId", record.occurrenceId)
        put("userId", record.userId)
        put("triggerAtMillis", record.triggerAtMillis)
        put("title", record.title)
        put("dose", record.dose ?: JSONObject.NULL)
        put("scheduledAt", record.scheduledAt)
        put("timezone", record.timezone)
        put("armed", record.armed)
      })
    }
    check(preferences(context).edit().putString(key, array.toString()).commit()) {
      "No se pudo persistir $key"
    }
  }

  fun scheduled(context: Context): List<AlarmRecord> = synchronized(lock) { read(context, SCHEDULED_KEY) }

  fun active(context: Context): List<AlarmRecord> = synchronized(lock) { read(context, ACTIVE_KEY) }

  fun scheduledForUser(context: Context, userId: String): List<AlarmRecord> =
    scheduled(context).filter { it.userId == userId }

  fun activeForUser(context: Context, userId: String): List<AlarmRecord> =
    active(context).filter { it.userId == userId }

  fun upsertScheduled(context: Context, record: AlarmRecord) = synchronized(lock) {
    val records = read(context, SCHEDULED_KEY)
    val index = records.indexOfFirst {
      it.occurrenceId == record.occurrenceId && it.userId == record.userId
    }
    if (index >= 0) records[index] = record else records += record
    write(context, SCHEDULED_KEY, records)
  }

  fun markArmed(context: Context, occurrenceId: String, userId: String) = synchronized(lock) {
    val records = read(context, SCHEDULED_KEY)
    val index = records.indexOfFirst { it.occurrenceId == occurrenceId && it.userId == userId }
    if (index >= 0) {
      records[index] = records[index].copy(armed = true)
      write(context, SCHEDULED_KEY, records)
    }
  }

  fun removeScheduled(context: Context, occurrenceId: String, userId: String) = synchronized(lock) {
    write(context, SCHEDULED_KEY, read(context, SCHEDULED_KEY).filterNot { it.occurrenceId == occurrenceId && it.userId == userId })
  }

  fun activateScheduled(context: Context, occurrenceId: String): AlarmRecord? = synchronized(lock) {
    val record = read(context, SCHEDULED_KEY).firstOrNull { it.occurrenceId == occurrenceId } ?: return@synchronized null
    val records = read(context, ACTIVE_KEY)
    if (records.none { it.occurrenceId == record.occurrenceId && it.userId == record.userId }) {
      records += record
      write(context, ACTIVE_KEY, records)
    }
    record
  }

  fun findScheduled(context: Context, occurrenceId: String, userId: String? = null): AlarmRecord? =
    scheduled(context).firstOrNull { it.occurrenceId == occurrenceId && (userId == null || it.userId == userId) }

  fun findActive(context: Context, occurrenceId: String, userId: String): AlarmRecord? =
    active(context).firstOrNull { it.occurrenceId == occurrenceId && it.userId == userId }

  fun removeActive(context: Context, occurrenceId: String, userId: String) = synchronized(lock) {
    write(context, ACTIVE_KEY, read(context, ACTIVE_KEY).filterNot { it.occurrenceId == occurrenceId && it.userId == userId })
  }

  fun clearUser(context: Context, userId: String): List<AlarmRecord> = synchronized(lock) {
    val scheduled = read(context, SCHEDULED_KEY)
    val active = read(context, ACTIVE_KEY)
    val removed = (scheduled + active).filter { it.userId == userId }.distinctBy { it.occurrenceId }
    write(context, SCHEDULED_KEY, scheduled.filterNot { it.userId == userId })
    write(context, ACTIVE_KEY, active.filterNot { it.userId == userId })
    if (preferences(context).getString(AUTHORIZED_USER_KEY, null) == userId) {
      check(preferences(context).edit().remove(AUTHORIZED_USER_KEY).commit()) {
        "No se pudo revocar el usuario autorizado"
      }
    }
    if (preferences(context).getString(SERVICE_USER_KEY, null) == userId) {
      check(preferences(context).edit().remove(SERVICE_USER_KEY).commit()) {
        "No se pudo limpiar el usuario del servicio"
      }
    }
    removed
  }

  fun authorizedUser(context: Context): String? = synchronized(lock) {
    preferences(context).getString(AUTHORIZED_USER_KEY, null)?.takeIf { it.isNotBlank() }
  }

  fun setAuthorizedUser(context: Context, userId: String) = synchronized(lock) {
    check(preferences(context).edit().putString(AUTHORIZED_USER_KEY, userId).commit())
  }

  fun clearAuthorizedUser(context: Context, userId: String) = synchronized(lock) {
    if (authorizedUser(context) == userId) {
      check(preferences(context).edit().remove(AUTHORIZED_USER_KEY).commit())
    }
  }

  fun serviceUser(context: Context): String? = synchronized(lock) {
    preferences(context).getString(SERVICE_USER_KEY, null)?.takeIf { it.isNotBlank() }
  }

  fun setServiceUser(context: Context, userId: String) = synchronized(lock) {
    check(preferences(context).edit().putString(SERVICE_USER_KEY, userId).commit())
  }

  fun clearServiceUser(context: Context) = synchronized(lock) {
    // La limpieza del servicio nunca debe bloquear ni tumbar el proceso.
    if (!preferences(context).edit().remove(SERVICE_USER_KEY).commit()) {
      Log.e(TAG, "No se pudo limpiar $SERVICE_USER_KEY")
    }
  }

  fun purgeUnscoped(context: Context): List<String> = synchronized(lock) {
    val ids = mutableSetOf<String>()
    listOf(SCHEDULED_KEY, ACTIVE_KEY).forEach { key ->
      val raw = preferences(context).getString(key, "[]") ?: "[]"
      var hasUnscoped = false
      runCatching {
        val array = JSONArray(raw)
        for (index in 0 until array.length()) {
          val item = array.optJSONObject(index) ?: continue
          if (item.optString("userId").isNotBlank()) continue
          val id = item.optString("occurrenceId")
          if (id.isNotBlank()) {
            ids += id
            hasUnscoped = true
          }
        }
      }.onFailure { Log.e(TAG, "No se pudo revisar $key", it) }
      if (hasUnscoped) {
        // Solamente se reescribe si había registros legados; las escrituras
        // se hacen desde receptores y nunca deben lanzar excepciones allí.
        runCatching { write(context, key, read(context, key)) }
          .onFailure { Log.e(TAG, "No se pudo purgar $key", it) }
      }
    }
    ids.toList()
  }

  fun allForUser(context: Context, userId: String): List<Pair<AlarmRecord, Boolean>> = synchronized(lock) {
    val activeIds = read(context, ACTIVE_KEY)
      .filter { it.userId == userId }
      .map { it.occurrenceId }
      .toSet()
    read(context, SCHEDULED_KEY)
      .filter { it.userId == userId }
      .map { it to activeIds.contains(it.occurrenceId) }
  }
}
