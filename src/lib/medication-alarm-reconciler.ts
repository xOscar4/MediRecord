import MedicationAlarm, { type NativeAlarmRecord } from '@modules/medication-alarm';

import { supabase } from '@/lib/supabase';

type PendingOccurrenceRow = {
  id: string;
  scheduled_at: string;
  timezone: string;
  status: string;
  medication_name: string | null;
  medication_dose_amount: string | null;
  medication_is_active: boolean | null;
};

const OCCURRENCE_COLUMNS = 'id,scheduled_at,timezone,status,medication_name,medication_dose_amount,medication_is_active';

function nativeRecord(row: PendingOccurrenceRow): NativeAlarmRecord | null {
  const triggerAtMillis = Date.parse(row.scheduled_at);
  if (!row.id || Number.isNaN(triggerAtMillis) || row.medication_is_active === false) return null;
  return {
    occurrenceId: row.id,
    triggerAtMillis,
    title: row.medication_name ?? 'Medicamento',
    dose: row.medication_dose_amount,
    scheduledAt: row.scheduled_at,
    timezone: row.timezone,
    active: false,
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
  if (userError || !userData.user) return;

  // La generación de ocurrencias sigue siendo responsabilidad exclusiva de Supabase.
  const { error: syncError } = await supabase.rpc('sync_dose_occurrences', {
    p_chunk_days: 90,
    p_horizon_days: 14,
  });
  if (syncError) return;

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('dose_occurrences_view')
    .select(OCCURRENCE_COLUMNS)
    .eq('user_id', userData.user.id)
    .eq('status', 'pending')
    .eq('medication_is_active', true)
    .gte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(500);
  if (error) return;

  const rows = (data ?? []) as unknown as PendingOccurrenceRow[];
  const desired = new Map<string, NativeAlarmRecord>();
  rows.forEach((row) => {
    const record = nativeRecord(row);
    if (record) desired.set(record.occurrenceId, record);
  });

  const scheduled = await MedicationAlarm.getScheduledAlarms();
  const active = await MedicationAlarm.getActiveAlarms();
  if (active.length > 0) await MedicationAlarm.resumeActiveAlarms();
  const activeIds = active.map((record) => record.occurrenceId);

  // Una alarma activa se conserva hasta confirmar su estado en el backend.
  if (activeIds.length > 0) {
    const { data: activeRows, error: activeError } = await supabase
      .from('dose_occurrences_view')
      .select('id,status')
      .eq('user_id', userData.user.id)
      .in('id', activeIds);
    if (activeError) return;
    const activePending = new Set((activeRows ?? []).filter((row) => row.status === 'pending').map((row) => row.id));
    active.forEach((record) => {
      if (activePending.has(record.occurrenceId)) desired.set(record.occurrenceId, record);
      else void MedicationAlarm.cancelAlarm(record.occurrenceId);
    });
  }

  for (const record of scheduled) {
    if (!desired.has(record.occurrenceId) && !record.active) {
      await MedicationAlarm.cancelAlarm(record.occurrenceId);
    }
  }

  for (const record of desired.values()) {
    const existing = scheduled.find((item) => item.occurrenceId === record.occurrenceId);
    if (record.active || (existing && sameSchedule(existing, record))) continue;
    try {
      await MedicationAlarm.scheduleAlarm(record);
    } catch {
      // La pantalla de permisos informa si Android ha bloqueado las alarmas exactas.
    }
  }
}
