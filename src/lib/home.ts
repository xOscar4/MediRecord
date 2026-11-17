import { supabase } from '@/lib/supabase';

export type HomeOccurrenceStatus = 'pending' | 'taken';

export type HomeOccurrence = {
  id: string;
  medicationId: string;
  scheduledAt: string;
  localDate: string;
  localTime: string;
  timezone: string;
  status: HomeOccurrenceStatus;
  isOverdue: boolean;
  medicationName: string;
  medicationDoseAmount: string | null;
};

export type HomeMedication = {
  id: string;
  name: string;
  doseAmount: string | null;
  photoPath: string | null;
  nextOccurrence: HomeOccurrence | null;
};

export type HomeSummary = {
  medications: HomeMedication[];
  upcomingOccurrences: HomeOccurrence[];
  counts: {
    pending: number;
    taken: number;
    overdue: number;
  };
};

type MedicationRow = {
  id: string;
  name: string;
  dose_amount: string | null;
  photo_path: string | null;
  is_active: boolean;
};

type OccurrenceRow = {
  id: string;
  medication_id: string | null;
  scheduled_at: string;
  local_date: string;
  local_time: string;
  timezone: string;
  status: string;
  is_overdue: boolean | null;
  medication_name: string | null;
  medication_dose_amount: string | null;
  medication_is_active: boolean | null;
};

function getLocalDate(timezone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone || undefined,
    year: 'numeric',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isHomeOccurrenceStatus(value: string): value is HomeOccurrenceStatus {
  return value === 'pending' || value === 'taken';
}

function toHomeOccurrence(row: OccurrenceRow): HomeOccurrence | null {
  if (!row.medication_id || !isHomeOccurrenceStatus(row.status) || row.medication_is_active === false) {
    return null;
  }

  return {
    id: row.id,
    medicationId: row.medication_id,
    scheduledAt: row.scheduled_at,
    localDate: row.local_date,
    localTime: row.local_time,
    timezone: row.timezone,
    status: row.status,
    isOverdue: Boolean(row.is_overdue),
    medicationName: row.medication_name ?? 'Medicamento',
    medicationDoseAmount: row.medication_dose_amount,
  };
}

function occurrenceTime(occurrence: HomeOccurrence): number {
  const timestamp = new Date(occurrence.scheduledAt).getTime();
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function pickNextOccurrence(occurrences: HomeOccurrence[]): HomeOccurrence | null {
  const pending = occurrences.filter((occurrence) => occurrence.status === 'pending');
  if (pending.length === 0) return null;

  return [...pending].sort((first, second) => occurrenceTime(first) - occurrenceTime(second))[0] ?? null;
}

const OCCURRENCE_COLUMNS =
  'id,medication_id,scheduled_at,local_date,local_time,timezone,status,is_overdue,medication_name,medication_dose_amount,medication_is_active';

export async function fetchHomeSummary(userId: string, timezone?: string): Promise<HomeSummary> {
  if (!userId) throw new Error('No hay un usuario autenticado para cargar el resumen.');

  const today = getLocalDate(timezone);
  const [medicationResult, pendingResult, takenResult] = await Promise.all([
    supabase
      .from('medications')
       .select('id,name,dose_amount,photo_path,is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase
      .from('dose_occurrences_view')
      .select(OCCURRENCE_COLUMNS)
      .eq('user_id', userId)
      .eq('medication_is_active', true)
      .eq('status', 'pending')
      .order('scheduled_at', { ascending: true })
      .limit(200),
    supabase
      .from('dose_occurrences_view')
      .select(OCCURRENCE_COLUMNS)
      .eq('user_id', userId)
      .eq('medication_is_active', true)
      .eq('status', 'taken')
      .eq('local_date', today)
      .order('scheduled_at', { ascending: true })
      .limit(200),
  ]);

  if (medicationResult.error) {
    throw new Error('No pudimos cargar tus medicamentos para el resumen. Inténtalo de nuevo.');
  }
  if (pendingResult.error || takenResult.error) {
    throw new Error('No pudimos cargar las tomas programadas. Inténtalo de nuevo.');
  }

  const medicationRows = (medicationResult.data ?? []) as unknown as MedicationRow[];
  const occurrenceRows = [
    ...((pendingResult.data ?? []) as unknown as OccurrenceRow[]),
    ...((takenResult.data ?? []) as unknown as OccurrenceRow[]),
  ];
  const occurrencesById = new Map<string, HomeOccurrence>();

  for (const row of occurrenceRows) {
    const occurrence = toHomeOccurrence(row);
    if (occurrence) occurrencesById.set(occurrence.id, occurrence);
  }

  const occurrences = [...occurrencesById.values()];
  const pendingOccurrences = occurrences
    .filter((occurrence) => occurrence.status === 'pending')
    .sort((first, second) => occurrenceTime(first) - occurrenceTime(second));
  const takenOccurrences = occurrences.filter((occurrence) => occurrence.status === 'taken');
  const medicationNameById = new Map(medicationRows.map((medication) => [medication.id, medication]));

  const medications = medicationRows
    .filter((medication) => medication.is_active)
    .map((medication) => {
      const medicationOccurrences = occurrences.filter((occurrence) => occurrence.medicationId === medication.id);
      const nextOccurrence = pickNextOccurrence(medicationOccurrences);
      return {
        id: medication.id,
        name: medication.name,
        doseAmount: medication.dose_amount,
        photoPath: medication.photo_path,
        nextOccurrence,
      };
    });

  const upcomingOccurrences = pendingOccurrences.slice(0, 5).map((occurrence) => {
    const medication = medicationNameById.get(occurrence.medicationId);
    return medication
      ? { ...occurrence, medicationName: medication.name, medicationDoseAmount: medication.dose_amount }
      : occurrence;
  });

  return {
    medications,
    upcomingOccurrences,
    counts: {
      pending: pendingOccurrences.filter((occurrence) => !occurrence.isOverdue).length,
      taken: takenOccurrences.length,
      overdue: pendingOccurrences.filter((occurrence) => occurrence.isOverdue).length,
    },
  };
}
