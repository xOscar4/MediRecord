import MedicationAlarm, { type NativeAlarmRecord } from '@modules/medication-alarm';

import { supabase } from '@/lib/supabase';

type PendingOccurrenceRow = {
  id: string;
  schedule_id: string | null;
  medication_id: string | null;
  scheduled_at: string;
  timezone: string;
  status: string;
  medication_name: string | null;
  medication_dose_amount: string | null;
  medication_is_active: boolean | null;
};

const OCCURRENCE_COLUMNS =
  'id,schedule_id,medication_id,scheduled_at,timezone,status,medication_name,medication_dose_amount,medication_is_active';
const PAGE_SIZE = 200;

function reportReconciliationError(stage: string, error: unknown): void {
  console.warn(`[MediRecord] No se pudo reconciliar alarmas (${stage})`, error);
}

/**
 * `getSession()` lee la sesión local de forma barata. Se usa para no seguir
 * programando alarmas si el usuario cerró sesión durante la reconciliación.
 */
async function sessionStillMatches(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id === userId;
  } catch {
    return false;
  }
}

function nativeRecord(row: PendingOccurrenceRow, userId: string): NativeAlarmRecord | null {
  const triggerAtMillis = Date.parse(row.scheduled_at);
  if (!row.id || Number.isNaN(triggerAtMillis) || row.medication_is_active === false) return null;
  return {
    occurrenceId: row.id,
    userId,
    triggerAtMillis,
    title: row.medication_name ?? 'Medicamento',
    dose: row.medication_dose_amount,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone,
    active: false,
    armed: false,
  };
}

function sameSchedule(first: NativeAlarmRecord, second: NativeAlarmRecord): boolean {
  return first.triggerAtMillis === second.triggerAtMillis
    && first.title === second.title
    && first.dose === second.dose
    && first.scheduledAt === second.scheduledAt
    && first.timezone === second.timezone;
}

export async function reconcileMedicationAlarms(): Promise<void> {
  if (!MedicationAlarm.available) return;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    if (userError) reportReconciliationError('sesión', userError);
    return;
  }
  const userId = userData.user.id;

  // getUser() ya validó la sesión contra Supabase; desde este punto el
  // receptor nativo solo puede reanudar registros de esta cuenta.
  if (!(await sessionStillMatches(userId))) return;
  try {
    await MedicationAlarm.setAuthorizedUser(userId);
  } catch (error) {
    reportReconciliationError('autorización nativa', error);
    return;
  }

  // La generación de ocurrencias sigue siendo responsabilidad exclusiva de Supabase.
  const { error: syncError } = await supabase.rpc('sync_dose_occurrences', {
    p_chunk_days: 90,
    p_horizon_days: 14,
  });
  if (syncError) {
    reportReconciliationError('sincronización', syncError);
    return;
  }

  const now = new Date().toISOString();
  const rows: PendingOccurrenceRow[] = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabase
      .from('dose_occurrences_view')
      .select(OCCURRENCE_COLUMNS)
      .eq('user_id', userId)
      .eq('status', 'pending')
      .eq('medication_is_active', true)
      .gte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      reportReconciliationError(`ocurrencias página ${page + 1}`, error);
      return;
    }
    const pageRows = (data ?? []) as unknown as PendingOccurrenceRow[];
    rows.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
    page += 1;
  }

  // Un cambio de hora cierra el horario anterior y genera uno nuevo. Las tomas
  // pendientes del horario cerrado no deben conservar alarmas antiguas.
  const medicationIds = [...new Set(rows.map((row) => row.medication_id).filter((id): id is string => Boolean(id)))];
  const activeScheduleIds = new Set<string>();
  if (medicationIds.length > 0) {
    const { data: activeSchedules, error: activeScheduleError } = await supabase
      .from('medication_schedules')
      .select('id')
      .eq('is_active', true)
      .in('medication_id', medicationIds);
    if (activeScheduleError) {
      reportReconciliationError('horarios vigentes', activeScheduleError);
      return;
    }
    (activeSchedules ?? []).forEach((schedule) => activeScheduleIds.add(schedule.id));
  }

  const desired = new Map<string, NativeAlarmRecord>();
  rows.forEach((row) => {
    if (row.schedule_id && !activeScheduleIds.has(row.schedule_id)) return;
    const record = nativeRecord(row, userId);
    if (record) desired.set(record.occurrenceId, record);
  });

  let scheduled: NativeAlarmRecord[];
  let active: NativeAlarmRecord[];
  try {
    scheduled = await MedicationAlarm.getScheduledAlarms(userId);
    active = await MedicationAlarm.getActiveAlarms(userId);
  } catch (error) {
    reportReconciliationError('almacenamiento nativo', error);
    return;
  }
  const activeIds = active.map((record) => record.occurrenceId);
  let validActive: NativeAlarmRecord[] = [];

  // Una alarma activa se conserva hasta confirmar su estado en el backend.
  if (activeIds.length > 0) {
    const { data: activeRows, error: activeError } = await supabase
      .from('dose_occurrences_view')
      .select('id,status,schedule_id')
      .eq('user_id', userId)
      .in('id', activeIds);
    if (activeError) {
      reportReconciliationError('validación de alarmas activas', activeError);
      return;
    }
    const activePending = new Set(
      (activeRows ?? [])
        .filter((row) => row.status === 'pending' && (!row.schedule_id || activeScheduleIds.has(row.schedule_id)))
        .map((row) => row.id)
    );
    validActive = active.filter((record) => activePending.has(record.occurrenceId));
    if (!(await sessionStillMatches(userId))) return;
    active.forEach((record) => {
      if (activePending.has(record.occurrenceId)) desired.set(record.occurrenceId, record);
      else {
        void MedicationAlarm.cancelAlarm(record.occurrenceId, userId).catch((error) => {
          reportReconciliationError(`cancelación ${record.occurrenceId}`, error);
        });
      }
    });
  }

  // Solo después de validar la pertenencia y el estado pending se permite al
  // servicio reanudar el sonido de esta cuenta.
  if (validActive.length > 0) {
    if (!(await sessionStillMatches(userId))) return;
    try {
      await MedicationAlarm.resumeActiveAlarms(userId);
    } catch (error) {
      reportReconciliationError('reanudación de alarmas activas', error);
      return;
    }
  }

  for (const record of scheduled) {
    if (!desired.has(record.occurrenceId) && !record.active) {
      if (!(await sessionStillMatches(userId))) return;
      try {
        await MedicationAlarm.cancelAlarm(record.occurrenceId, userId);
      } catch (error) {
        reportReconciliationError(`cancelación ${record.occurrenceId}`, error);
      }
    }
  }

  // El módulo nativo ya rechaza las alarmas exactas sin este permiso. Consultarlo
  // aquí evita intentos de programación repetidos y mantiene la navegación
  // intacta mientras la persona no lo concede.
  let exactAlarmsAllowed = true;
  try {
    const permissionState = await MedicationAlarm.getPermissionState();
    exactAlarmsAllowed = permissionState.exactAlarmsAllowed;
  } catch (error) {
    reportReconciliationError('permiso de alarmas exactas', error);
    exactAlarmsAllowed = false;
  }
  if (!exactAlarmsAllowed) {
    console.warn('[MediRecord] Permiso de alarmas exactas no concedido; no se programarán alarmas hasta autorizarlo.');
    return;
  }

  for (const record of desired.values()) {
    const existing = scheduled.find((item) => item.occurrenceId === record.occurrenceId);
    if (record.active || (existing && existing.armed && sameSchedule(existing, record))) continue;
    // Una sesión cerrada durante la reconciliación no debe volver a programar
    // alarmas del usuario anterior.
    if (!(await sessionStillMatches(userId))) return;
    try {
      await MedicationAlarm.scheduleAlarm(record);
    } catch (error) {
      reportReconciliationError(`programación ${record.occurrenceId}`, error);
    }
  }
}
