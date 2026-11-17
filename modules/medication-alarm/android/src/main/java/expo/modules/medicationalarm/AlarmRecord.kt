package expo.modules.medicationalarm

data class AlarmRecord(
  val occurrenceId: String,
  val triggerAtMillis: Long,
  val title: String,
  val dose: String?,
  val scheduledAt: String,
  val timezone: String,
)
