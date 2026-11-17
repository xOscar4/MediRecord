package expo.modules.medicationalarm

data class AlarmRecord(
  val occurrenceId: String,
  val userId: String,
  val triggerAtMillis: Long,
  val title: String,
  val dose: String?,
  val scheduledAt: String,
  val timezone: String,
  val armed: Boolean = false,
)
