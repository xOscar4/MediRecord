import { supabase } from '@/lib/supabase';

type DoseResolution = 'taken' | 'already_resolved' | 'queued';
type QueuedResolution = { occurrenceId: string; queuedAt: string };

function queueKey(userId: string): string {
  return `medirecord.pending-dose-resolutions.${userId}`;
}

function readQueue(userId: string): QueuedResolution[] {
  try {
    const raw = localStorage.getItem(queueKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is QueuedResolution => (
      typeof item === 'object'
      && item !== null
      && typeof (item as QueuedResolution).occurrenceId === 'string'
      && typeof (item as QueuedResolution).queuedAt === 'string'
    ));
  } catch {
    return [];
  }
}

function writeQueue(userId: string, queue: QueuedResolution[]): void {
  if (queue.length === 0) localStorage.removeItem(queueKey(userId));
  else localStorage.setItem(queueKey(userId), JSON.stringify(queue));
}

function enqueue(userId: string, occurrenceId: string): void {
  const queue = readQueue(userId);
  if (queue.some((item) => item.occurrenceId === occurrenceId)) return;
  queue.push({ occurrenceId, queuedAt: new Date().toISOString() });
  writeQueue(userId, queue);
}

function dequeue(userId: string, occurrenceId: string): void {
  writeQueue(userId, readQueue(userId).filter((item) => item.occurrenceId !== occurrenceId));
}

function isRetryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const candidate = error as { code?: string; message?: string };
  if (candidate.code && ['42501', 'PGRST301', 'PGRST302', '23514'].includes(candidate.code)) return false;
  const message = (candidate.message ?? '').toLowerCase();
  return !message.includes('permission') && !message.includes('jwt') && !message.includes('not authenticated');
}

async function getUserId(): Promise<string | null> {
  // getSession() usa la sesión persistida localmente; así una confirmación
  // hecha sin conexión todavía puede entrar en la cola del usuario correcto.
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) return null;
  return data.session.user.id;
}

async function updatePendingOccurrence(userId: string, occurrenceId: string): Promise<DoseResolution | 'pending'> {
  const { data, error } = await supabase
    .from('dose_occurrences')
    .update({ status: 'taken' })
    .eq('id', occurrenceId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .select('id,status')
    .maybeSingle();

  if (error) throw error;
  if (data?.id === occurrenceId && data.status === 'taken') return 'taken';

  const { data: current, error: currentError } = await supabase
    .from('dose_occurrences_view')
    .select('id,status')
    .eq('id', occurrenceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (currentError) throw currentError;
  if (current?.status === 'taken' || current?.status === 'skipped') return 'already_resolved';
  if (current?.status === 'pending') return 'pending';
  return 'already_resolved';
}

export async function confirmDoseTaken(occurrenceId: string): Promise<DoseResolution> {
  if (!occurrenceId) throw new Error('La ocurrencia de la toma no es válida.');
  const userId = await getUserId();
  if (!userId) throw new Error('Tu sesión ya no es válida. Vuelve a iniciar sesión para registrar la toma.');

  try {
    const result = await updatePendingOccurrence(userId, occurrenceId);
    if (result === 'pending') throw new Error('La toma sigue pendiente y no pudo confirmarse.');
    dequeue(userId, occurrenceId);
    return result;
  } catch (error) {
    if (!isRetryable(error)) throw error;
    enqueue(userId, occurrenceId);
    return 'queued';
  }
}

export async function flushPendingDoseResolutions(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  for (const item of readQueue(userId)) {
    try {
      const result = await updatePendingOccurrence(userId, item.occurrenceId);
      if (result !== 'pending') dequeue(userId, item.occurrenceId);
    } catch (error) {
      if (!isRetryable(error)) continue;
    }
  }
}
