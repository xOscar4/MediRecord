package expo.modules.medicationalarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

internal object AlarmStore {
  private const val PREFS = "medication_alarm_store"
  private const val SCHEDULED_KEY = "scheduled"
  private const val ACTIVE_KEY = "active"
  private val lock = Any()

  private fun preferences(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  private fun read(context: Context, key: String): MutableList<AlarmRecord> {
    val result = mutableListOf<AlarmRecord>()
    val array = JSONArray(preferences(context).getString(key, "[]") ?: "[]")
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: continue
      val occurrenceId = item.optString("occurrenceId")
      if (occurrenceId.isBlank()) continue
      result += AlarmRecord(
        occurrenceId = occurrenceId,
        triggerAtMillis = item.optLong("triggerAtMillis", 0L),
        title = item.optString("title", "Medicamento"),
        dose = if (item.isNull("dose")) null else item.optString("dose"),
        scheduledAt = item.optString("scheduledAt", ""),
        timezone = item.optString("timezone", "UTC"),
      )
    }
    return result
  }

  private fun write(context: Context, key: String, records: List<AlarmRecord>) {
    val array = JSONArray()
    records.forEach { record ->
      array.put(JSONObject().apply {
        put("occurrenceId", record.occurrenceId)
        put("triggerAtMillis", record.triggerAtMillis)
        put("title", record.title)
        put("dose", record.dose ?: JSONObject.NULL)
        put("scheduledAt", record.scheduledAt)
        put("timezone", record.timezone)
      })
    }
    preferences(context).edit().putString(key, array.toString()).apply()
  }

  fun scheduled(context: Context): List<AlarmRecord> = synchronized(lock) { read(context, SCHEDULED_KEY) }

  fun active(context: Context): List<AlarmRecord> = synchronized(lock) { read(context, ACTIVE_KEY) }

  fun upsertScheduled(context: Context, record: AlarmRecord) = synchronized(lock) {
    val records = read(context, SCHEDULED_KEY)
    val index = records.indexOfFirst { it.occurrenceId == record.occurrenceId }
    if (index >= 0) records[index] = record else records += record
    write(context, SCHEDULED_KEY, records)
  }

  fun removeScheduled(context: Context, occurrenceId: String) = synchronized(lock) {
    write(context, SCHEDULED_KEY, read(context, SCHEDULED_KEY).filterNot { it.occurrenceId == occurrenceId })
  }

  fun markActive(context: Context, record: AlarmRecord) = synchronized(lock) {
    val records = read(context, ACTIVE_KEY)
    if (records.none { it.occurrenceId == record.occurrenceId }) records += record
    write(context, ACTIVE_KEY, records)
  }

  fun removeActive(context: Context, occurrenceId: String) = synchronized(lock) {
    write(context, ACTIVE_KEY, read(context, ACTIVE_KEY).filterNot { it.occurrenceId == occurrenceId })
  }

  fun findScheduled(context: Context, occurrenceId: String): AlarmRecord? = scheduled(context).firstOrNull { it.occurrenceId == occurrenceId }

  fun all(context: Context): List<Pair<AlarmRecord, Boolean>> = synchronized(lock) {
    val activeIds = read(context, ACTIVE_KEY).map { it.occurrenceId }.toSet()
    read(context, SCHEDULED_KEY).map { it to activeIds.contains(it.occurrenceId) }
  }
}
