/**
 * Conversión pura entre horarios HH:mm y fechas del selector.
 *
 * La hora de un medicamento es una hora local (HH:mm), no un instante UTC.
 * Por eso aquí solo se usan getters/setters locales: nunca `toISOString()`,
 * que desplazaría la hora en zonas horarias con offset distinto de cero.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Acepta "08:00" y valores de Postgres como "08:00:00". */
export function parseTimeOfDay(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return { hours, minutes };
}

/** Crea la fecha que debe recibir el picker para mostrar la hora guardada. */
export function timeOfDayToPickerDate(value: string, now = new Date()): Date {
  const parsed = parseTimeOfDay(value);
  const date = new Date(now.getTime());
  date.setHours(parsed?.hours ?? 8, parsed?.minutes ?? 0, 0, 0);
  return date;
}

/** Convierte la fecha devuelta por el picker al formato HH:mm del proyecto. */
export function pickerDateToTimeOfDay(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Crea la fecha local que debe recibir el picker para una fecha AAAA-MM-DD. */
export function isoDateToPickerDate(value: string, now = new Date()): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  const date = new Date(now.getTime());
  date.setHours(12, 0, 0, 0);
  if (!match) return date;

  date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date;
}

/** Convierte la fecha devuelta por el picker a AAAA-MM-DD local. */
export function pickerDateToIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

type Schedulable = {
  id: string;
  timeOfDay: string;
  startDate: string;
  endDate: string;
};

/**
 * Escribe el valor confirmado en el horario indicado sin tocar los demás.
 * Se usa tanto en el editor como en la comprobación de round-trip.
 */
export function applyPickedValue<T extends Schedulable>(
  schedules: T[],
  scheduleId: string,
  kind: 'time' | 'startDate' | 'endDate',
  date: Date
): T[] {
  return schedules.map((schedule) => {
    if (schedule.id !== scheduleId) return schedule;
    if (kind === 'time') return { ...schedule, timeOfDay: pickerDateToTimeOfDay(date) };
    if (kind === 'startDate') return { ...schedule, startDate: pickerDateToIsoDate(date) };
    return { ...schedule, endDate: pickerDateToIsoDate(date) };
  });
}
