import { supabase } from '@/lib/supabase';
import type {
  Medication,
  MedicationCatalog,
  MedicationDetailsInput,
  MedicationDoseForm,
  MedicationRegistrationInput,
  MedicationSchedule,
  MedicationScheduleDraft,
} from '@/types/medications';

const MEDICATION_COLUMNS =
  'id,user_id,name,dose_amount,dose_form,instructions,photo_path,is_active,archived_at,created_at,updated_at';
const SCHEDULE_COLUMNS =
  'id,medication_id,time_of_day,days_of_week,start_date,end_date,is_active,archived_at,notes';

const DOSE_FORMS: MedicationDoseForm[] = [
  'tablet',
  'capsule',
  'liquid',
  'drops',
  'injection',
  'inhaler',
  'other',
];

type MedicationRow = Omit<Medication, 'schedules' | 'dose_form'> & {
  dose_form: string | null;
};

type ScheduleRow = MedicationSchedule;

export type MedicationRegistrationStage = 'medication' | 'schedules' | 'sync';

export class MedicationRegistrationError extends Error {
  readonly stage: MedicationRegistrationStage;
  readonly medicationId: string | null;

  constructor(stage: MedicationRegistrationStage, message: string, medicationId: string | null = null) {
    super(message);
    this.name = 'MedicationRegistrationError';
    this.stage = stage;
    this.medicationId = medicationId;
  }
}

export type MedicationEditStage = 'medication' | 'schedule' | 'sync';

export class MedicationEditError extends Error {
  readonly stage: MedicationEditStage;
  readonly scheduleId: string | null;

  constructor(stage: MedicationEditStage, message: string, scheduleId: string | null = null) {
    super(message);
    this.name = 'MedicationEditError';
    this.stage = stage;
    this.scheduleId = scheduleId;
  }
}

export type MedicationArchiveResult = {
  medicationId: string;
  archived: boolean;
  alreadyArchived: boolean;
  skippedFuture: number;
};

export type MedicationRestoreResult = {
  medicationId: string;
  restored: boolean;
  archivedSchedules: number;
  requiresNewSchedule: boolean;
};

export class MedicationArchiveError extends Error {
  readonly action: 'archive' | 'restore' | 'delete';

  constructor(action: 'archive' | 'restore' | 'delete', message: string) {
    super(message);
    this.name = 'MedicationArchiveError';
    this.action = action;
  }
}

export function parseDoseForm(value: string | null): MedicationDoseForm | null {
  return value && DOSE_FORMS.includes(value as MedicationDoseForm)
    ? (value as MedicationDoseForm)
    : null;
}

function toMedication(row: MedicationRow, schedules: MedicationSchedule[]): Medication {
  return {
    ...row,
    dose_form: parseDoseForm(row.dose_form),
    schedules,
  };
}

function normalizeOptionalText(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function dateRangesOverlap(first: MedicationScheduleDraft, second: MedicationScheduleDraft): boolean {
  const firstEnd = first.endDate || '9999-12-31';
  const secondEnd = second.endDate || '9999-12-31';
  return first.startDate <= secondEnd && second.startDate <= firstEnd;
}

function schedulesConflict(first: MedicationScheduleDraft, second: MedicationScheduleDraft): boolean {
  return first.timeOfDay === second.timeOfDay
    && dateRangesOverlap(first, second)
    && first.daysOfWeek.some((day) => second.daysOfWeek.includes(day));
}

function normalizeSchedules(schedules: MedicationScheduleDraft[]): MedicationScheduleDraft[] {
  return schedules.map((schedule) => ({
    ...schedule,
    timeOfDay: schedule.timeOfDay.trim(),
    daysOfWeek: [...new Set(schedule.daysOfWeek)].sort((first, second) => first - second),
    startDate: schedule.startDate.trim(),
    endDate: schedule.endDate.trim(),
    notes: schedule.notes?.trim() ?? '',
  }));
}

export function validateScheduleDrafts(schedules: MedicationScheduleDraft[], requireAtLeastOne = true): MedicationScheduleDraft[] {
  if (requireAtLeastOne && schedules.length === 0) throw new Error('Agrega al menos un horario de administración.');
  const normalizedSchedules = normalizeSchedules(schedules);
  normalizedSchedules.forEach((schedule, index) => {
    if (!isValidTime(schedule.timeOfDay)) {
      throw new Error(`Revisa la hora del horario ${index + 1}. Usa el formato HH:MM.`);
    }
    if (schedule.daysOfWeek.length === 0) {
      throw new Error(`Selecciona al menos un día para el horario ${index + 1}.`);
    }
    if (schedule.daysOfWeek.some((day) => day < 1 || day > 7)) {
      throw new Error(`Los días del horario ${index + 1} deben estar entre lunes (1) y domingo (7).`);
    }
    if (!isIsoDate(schedule.startDate)) {
      throw new Error(`Revisa la fecha de inicio del horario ${index + 1}. Usa el formato AAAA-MM-DD.`);
    }
    if (schedule.endDate && !isIsoDate(schedule.endDate)) {
      throw new Error(`Revisa la fecha de finalización del horario ${index + 1}. Usa el formato AAAA-MM-DD.`);
    }
    if (schedule.endDate && schedule.endDate < schedule.startDate) {
      throw new Error(`La fecha de finalización del horario ${index + 1} no puede ser anterior al inicio.`);
    }
    if ((schedule.notes ?? '').length > 500) {
      throw new Error(`Las notas del horario ${index + 1} no pueden superar 500 caracteres.`);
    }
  });

  for (let firstIndex = 0; firstIndex < normalizedSchedules.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < normalizedSchedules.length; secondIndex += 1) {
      if (schedulesConflict(normalizedSchedules[firstIndex], normalizedSchedules[secondIndex])) {
        throw new Error('Hay horarios que se solapan. Cambia la hora, los días o el rango de fechas.');
      }
    }
  }

  return normalizedSchedules;
}

export function validateMedicationRegistration(input: MedicationRegistrationInput): MedicationRegistrationInput {
  const name = input.name.trim();
  const doseAmount = input.doseAmount.trim();
  const instructions = input.instructions.trim();

  if (!name) throw new Error('Escribe el nombre del medicamento.');
  if (name.length > 120) throw new Error('El nombre del medicamento no puede superar 120 caracteres.');
  if (instructions.length > 1000) throw new Error('Las instrucciones no pueden superar 1000 caracteres.');
  if (input.doseForm !== null && !DOSE_FORMS.includes(input.doseForm)) {
    throw new Error('La forma farmacéutica seleccionada no es válida.');
  }

  return {
    name,
    doseAmount,
    doseForm: input.doseForm,
    instructions,
    schedules: validateScheduleDrafts(input.schedules),
  };
}

function formatSupabaseError(error: { code?: string; message?: string }, fallback: string, permissionMessage = 'Tu sesión no permite guardar este medicamento. Vuelve a iniciar sesión.'): string {
  if (error.code === '23P01') return 'Los horarios se solapan con una combinación incompatible. Revisa la hora, los días y las fechas.';
  if (error.code === '22023' && error.message) return error.message;
  if (error.code === '42501') return permissionMessage;
  return fallback;
}

async function getAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new MedicationRegistrationError('medication', 'No hay un usuario autenticado para registrar el medicamento.');
  }
  return data.user;
}

async function insertMedication(input: MedicationRegistrationInput, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('medications')
    .insert({
      user_id: userId,
      name: input.name,
      dose_amount: normalizeOptionalText(input.doseAmount),
      dose_form: input.doseForm,
      instructions: normalizeOptionalText(input.instructions),
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new MedicationRegistrationError(
      'medication',
      formatSupabaseError(error ?? {}, 'No pudimos registrar el medicamento. Inténtalo de nuevo.')
    );
  }

  return data.id as string;
}

function scheduleMatchesDraft(schedule: Pick<MedicationSchedule, 'time_of_day' | 'days_of_week' | 'start_date' | 'end_date'>, draft: MedicationScheduleDraft): boolean {
  const existingTime = schedule.time_of_day.slice(0, 5);
  const existingDays = [...schedule.days_of_week].sort((first, second) => first - second);
  return existingTime === draft.timeOfDay
    && existingDays.length === draft.daysOfWeek.length
    && existingDays.every((day, index) => day === draft.daysOfWeek[index])
    && schedule.start_date === draft.startDate
    && (schedule.end_date ?? '') === draft.endDate;
}

async function insertMedicationSchedules(medicationId: string, schedules: MedicationScheduleDraft[]): Promise<void> {
  const { data: existingData, error: existingError } = await supabase
    .from('medication_schedules')
    .select('time_of_day,days_of_week,start_date,end_date')
    .eq('medication_id', medicationId);

  if (existingError) {
    throw new MedicationRegistrationError('schedules', 'No pudimos comprobar los horarios guardados. Inténtalo de nuevo.', medicationId);
  }

  const existingSchedules = (existingData ?? []) as unknown as Pick<MedicationSchedule, 'time_of_day' | 'days_of_week' | 'start_date' | 'end_date'>[];
  const rowsToInsert = schedules
    .filter((draft) => !existingSchedules.some((schedule) => scheduleMatchesDraft(schedule, draft)))
    .map((schedule) => ({
      medication_id: medicationId,
      time_of_day: schedule.timeOfDay,
      days_of_week: schedule.daysOfWeek,
      start_date: schedule.startDate,
      end_date: schedule.endDate || null,
      notes: null,
    }));

  if (rowsToInsert.length === 0) return;

  const { error } = await supabase.from('medication_schedules').insert(rowsToInsert);
  if (error) {
    throw new MedicationRegistrationError(
      'schedules',
      formatSupabaseError(error, 'El medicamento quedó registrado, pero no pudimos guardar sus horarios. Revisa los datos e inténtalo de nuevo.'),
      medicationId
    );
  }
}

async function syncDoseOccurrences(medicationId: string): Promise<void> {
  const { error } = await supabase.rpc('sync_dose_occurrences', {
    p_chunk_days: 90,
    p_horizon_days: 14,
  });

  if (error) {
    throw new MedicationRegistrationError(
      'sync',
      `El medicamento y sus horarios fueron guardados, pero la sincronización de tomas quedó pendiente. ${formatSupabaseError(error, 'Puedes reintentarlo ahora.')}`,
      medicationId
    );
  }
}

export async function registerMedication(input: MedicationRegistrationInput, existingMedicationId?: string): Promise<{ medicationId: string }> {
  const normalizedInput = validateMedicationRegistration(input);
  const user = await getAuthenticatedUser();
  const medicationId = existingMedicationId ?? await insertMedication(normalizedInput, user.id);

  try {
    await insertMedicationSchedules(medicationId, normalizedInput.schedules);
  } catch (error) {
    if (error instanceof MedicationRegistrationError) throw error;
    throw new MedicationRegistrationError('schedules', 'El medicamento quedó registrado, pero no pudimos guardar sus horarios. Inténtalo de nuevo.', medicationId);
  }

  await syncDoseOccurrences(medicationId);
  return { medicationId };
}

async function getAuthenticatedUserForEdit() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new MedicationEditError('medication', 'No hay un usuario autenticado para editar este medicamento.');
  }
  return data.user;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export async function archiveMedication(medicationId: string, skipFuture = true): Promise<MedicationArchiveResult> {
  if (!medicationId) throw new MedicationArchiveError('archive', 'El medicamento solicitado no es válido.');

  const { data, error } = await supabase.rpc('archive_medication', {
    p_medication_id: medicationId,
    p_skip_future: skipFuture,
  });

  if (error) {
    throw new MedicationArchiveError(
      'archive',
      formatSupabaseError(error, 'No pudimos archivar el medicamento. Inténtalo de nuevo.', 'Tu sesión no permite archivar este medicamento. Vuelve a iniciar sesión.')
    );
  }

  if (!isRecord(data) || data.archived !== true || typeof data.medication_id !== 'string') {
    throw new MedicationArchiveError('archive', 'No recibimos una confirmación válida del archivado. Recarga e inténtalo de nuevo.');
  }

  return {
    medicationId: data.medication_id,
    archived: true,
    alreadyArchived: data.already_archived === true,
    skippedFuture: typeof data.skipped_future === 'number' ? data.skipped_future : 0,
  };
}

export async function restoreMedication(medicationId: string): Promise<MedicationRestoreResult> {
  if (!medicationId) throw new MedicationArchiveError('restore', 'El medicamento solicitado no es válido.');

  const { data, error } = await supabase.rpc('restore_medication', {
    p_medication_id: medicationId,
  });

  if (error) {
    throw new MedicationArchiveError(
      'restore',
      formatSupabaseError(error, 'No pudimos restaurar el medicamento. Inténtalo de nuevo.', 'Tu sesión no permite restaurar este medicamento. Vuelve a iniciar sesión.')
    );
  }

  if (!isRecord(data) || data.restored !== true || typeof data.medication_id !== 'string') {
    throw new MedicationArchiveError('restore', 'No recibimos una confirmación válida de la restauración. Recarga e inténtalo de nuevo.');
  }

  return {
    medicationId: data.medication_id,
    restored: true,
    archivedSchedules: typeof data.archived_schedules === 'number' ? data.archived_schedules : 0,
    requiresNewSchedule: data.requires_new_schedule === true,
  };
}

export type MedicationDeleteResult = {
  medicationId: string;
  deleted: boolean;
};

/**
 * Eliminación definitiva mediante la RPC ya desplegada. La RPC protege el
 * historial: bloquea la eliminación si existen tomas registradas o fotografía,
 * y solo borra la fila del medicamento (los horarios se eliminan en cascada).
 */
export async function deleteMedication(medicationId: string): Promise<MedicationDeleteResult> {
  if (!medicationId) throw new MedicationArchiveError('delete', 'El medicamento solicitado no es válido.');

  const { data, error } = await supabase.rpc('delete_medication', {
    p_medication_id: medicationId,
  });

  if (error) {
    const message = error.message && (error.code === '23503' || error.code === '23514')
      ? error.message
      : error.code === '42501'
        ? 'Tu sesión no permite eliminar este medicamento. Vuelve a iniciar sesión.'
        : 'No pudimos eliminar el medicamento. Inténtalo de nuevo.';
    throw new MedicationArchiveError('delete', message);
  }

  if (!isRecord(data) || data.deleted !== true || typeof data.medication_id !== 'string') {
    throw new MedicationArchiveError('delete', 'No recibimos una confirmación válida de la eliminación. Recarga e inténtalo de nuevo.');
  }

  return { medicationId: data.medication_id, deleted: true };
}

export async function fetchMedicationById(medicationId: string): Promise<Medication> {
  if (!medicationId) throw new MedicationEditError('medication', 'El medicamento solicitado no es válido.');
  const user = await getAuthenticatedUserForEdit();
  const { data, error } = await supabase
    .from('medications')
    .select(MEDICATION_COLUMNS)
    .eq('id', medicationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) {
    throw new MedicationEditError('medication', 'No encontramos este medicamento o no tienes permiso para editarlo.');
  }

  const { data: scheduleData, error: scheduleError } = await supabase
    .from('medication_schedules')
    .select(SCHEDULE_COLUMNS)
    .eq('medication_id', medicationId)
    .order('time_of_day', { ascending: true });

  if (scheduleError) {
    throw new MedicationEditError('schedule', 'No pudimos cargar los horarios del medicamento. Inténtalo de nuevo.');
  }

  return toMedication(
    data as unknown as MedicationRow,
    (scheduleData ?? []) as unknown as MedicationSchedule[]
  );
}

export function validateMedicationDetails(input: MedicationDetailsInput): MedicationDetailsInput {
  const name = input.name.trim();
  const doseAmount = input.doseAmount.trim();
  const instructions = input.instructions.trim();

  if (!name) throw new Error('Escribe el nombre del medicamento.');
  if (name.length > 120) throw new Error('El nombre del medicamento no puede superar 120 caracteres.');
  if (instructions.length > 1000) throw new Error('Las instrucciones no pueden superar 1000 caracteres.');
  if (input.doseForm !== null && !DOSE_FORMS.includes(input.doseForm)) {
    throw new Error('La forma farmacéutica seleccionada no es válida.');
  }

  return { name, doseAmount, doseForm: input.doseForm, instructions };
}

export async function updateMedicationDetails(medicationId: string, input: MedicationDetailsInput): Promise<void> {
  const normalizedInput = validateMedicationDetails(input);
  const user = await getAuthenticatedUserForEdit();
  const { data, error } = await supabase
    .from('medications')
    .update({
      name: normalizedInput.name,
      dose_amount: normalizeOptionalText(normalizedInput.doseAmount),
      dose_form: normalizedInput.doseForm,
      instructions: normalizeOptionalText(normalizedInput.instructions),
    })
    .eq('id', medicationId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    throw new MedicationEditError(
      'medication',
      formatSupabaseError(error ?? {}, 'No pudimos actualizar los datos del medicamento. Inténtalo de nuevo.')
    );
  }
}

async function runDoseSync(scheduleId: string | null = null): Promise<void> {
  const { error } = await supabase.rpc('sync_dose_occurrences', {
    p_chunk_days: 90,
    p_horizon_days: 14,
  });

  if (error) {
    throw new MedicationEditError(
      'sync',
      `Los cambios se guardaron, pero la sincronización de tomas quedó pendiente. ${formatSupabaseError(error, 'Puedes reintentarlo ahora.')}`,
      scheduleId
    );
  }
}

export async function syncMedicationOccurrences(): Promise<void> {
  await runDoseSync();
}

function sameDays(first: number[], second: number[]): boolean {
  const firstSorted = [...first].sort((left, right) => left - right);
  const secondSorted = [...second].sort((left, right) => left - right);
  return firstSorted.length === secondSorted.length && firstSorted.every((day, index) => day === secondSorted[index]);
}

async function setScheduleEndDate(scheduleId: string, endDate: string): Promise<void> {
  const { error } = await supabase.rpc('set_schedule_end_date', {
    p_schedule_id: scheduleId,
    p_end_date: endDate || null,
    p_skip_after_end: true,
  });

  if (error) {
    throw new MedicationEditError(
      'schedule',
      formatSupabaseError(error, 'No pudimos actualizar la fecha de finalización del horario. Inténtalo de nuevo.'),
      scheduleId
    );
  }
}

async function updateScheduleNotes(medicationId: string, scheduleId: string, notes: string): Promise<void> {
  const { data, error } = await supabase
    .from('medication_schedules')
    .update({ notes: notes || null })
    .eq('id', scheduleId)
    .eq('medication_id', medicationId)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    throw new MedicationEditError(
      'schedule',
      formatSupabaseError(error ?? {}, 'No pudimos actualizar las notas del horario. Inténtalo de nuevo.'),
      scheduleId
    );
  }
}

export async function saveMedicationScheduleChange(
  medicationId: string,
  draft: MedicationScheduleDraft,
  original: MedicationSchedule | null
): Promise<{ scheduleId: string }> {
  const [schedule] = validateScheduleDrafts([draft]);
  if (!schedule) throw new MedicationEditError('schedule', 'El horario no es válido.');

  if (!original) {
    const { data, error } = await supabase
      .from('medication_schedules')
      .insert({
        medication_id: medicationId,
        time_of_day: schedule.timeOfDay,
        days_of_week: schedule.daysOfWeek,
        start_date: schedule.startDate,
        end_date: schedule.endDate || null,
        notes: schedule.notes || null,
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      throw new MedicationEditError(
        'schedule',
        formatSupabaseError(error ?? {}, 'No pudimos agregar el nuevo horario. Revisa la hora, los días y las fechas.'),
        null
      );
    }

    const scheduleId = data.id as string;
    await runDoseSync(scheduleId);
    return { scheduleId };
  }

  const originalTime = original.time_of_day.slice(0, 5);
  const originalEndDate = original.end_date ?? '';
  const originalNotes = original.notes ?? '';
  const coreChanged = originalTime !== schedule.timeOfDay
    || !sameDays(original.days_of_week, schedule.daysOfWeek)
    || original.start_date !== schedule.startDate;
  const endChanged = originalEndDate !== schedule.endDate;
  const notesChanged = originalNotes !== (schedule.notes ?? '');

  if (!coreChanged && !endChanged && !notesChanged) return { scheduleId: original.id };

  if (coreChanged) {
    const { data, error } = await supabase.rpc('replace_schedule', {
      p_schedule_id: original.id,
      p_time_of_day: schedule.timeOfDay,
      p_days_of_week: schedule.daysOfWeek,
      p_start_date: original.start_date === schedule.startDate ? null : schedule.startDate,
      p_notes: notesChanged ? (schedule.notes || null) : null,
      p_skip_future: true,
    });

    if (error) {
      throw new MedicationEditError(
        'schedule',
        formatSupabaseError(error, 'No pudimos reemplazar el horario. Revisa la hora, los días y las fechas.'),
        original.id
      );
    }

    const newScheduleId = typeof (data as { new_schedule_id?: unknown } | null)?.new_schedule_id === 'string'
      ? (data as { new_schedule_id: string }).new_schedule_id
      : null;
    if (!newScheduleId) {
      throw new MedicationEditError('schedule', 'El horario cambió, pero no recibimos su nuevo identificador. Recarga e inténtalo de nuevo.', original.id);
    }

    if (schedule.endDate || originalEndDate) {
      await setScheduleEndDate(newScheduleId, schedule.endDate);
    }
    return { scheduleId: newScheduleId };
  }

  if (endChanged) await setScheduleEndDate(original.id, schedule.endDate);
  if (notesChanged) await updateScheduleNotes(medicationId, original.id, schedule.notes ?? '');
  return { scheduleId: original.id };
}

export async function fetchMedicationCatalog(userId: string): Promise<MedicationCatalog> {
  if (!userId) {
    throw new Error('No hay un usuario autenticado para consultar medicamentos.');
  }

  const { data: medicationData, error: medicationError } = await supabase
    .from('medications')
    .select(MEDICATION_COLUMNS)
    .eq('user_id', userId)
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });

  if (medicationError) {
    throw new Error('No pudimos cargar tus medicamentos. Inténtalo de nuevo.');
  }

  const medicationRows = (medicationData ?? []) as unknown as MedicationRow[];
  if (medicationRows.length === 0) {
    return { active: [], archived: [] };
  }

  const medicationIds = medicationRows.map((medication) => medication.id);
  const { data: scheduleData, error: scheduleError } = await supabase
    .from('medication_schedules')
    .select(SCHEDULE_COLUMNS)
    .in('medication_id', medicationIds)
    .order('time_of_day', { ascending: true });

  if (scheduleError) {
    throw new Error('No pudimos cargar los horarios de tus medicamentos. Inténtalo de nuevo.');
  }

  const scheduleRows = (scheduleData ?? []) as unknown as ScheduleRow[];
  const schedulesByMedication = new Map<string, MedicationSchedule[]>();

  for (const schedule of scheduleRows) {
    const schedules = schedulesByMedication.get(schedule.medication_id) ?? [];
    schedules.push(schedule);
    schedulesByMedication.set(schedule.medication_id, schedules);
  }

  const medications = medicationRows.map((medication) =>
    toMedication(medication, schedulesByMedication.get(medication.id) ?? [])
  );

  return {
    active: medications.filter((medication) => medication.is_active),
    archived: medications.filter((medication) => !medication.is_active),
  };
}
