import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { reconcileMedicationAlarms } from '@/lib/medication-alarm-reconciler';
import { archiveMedication, type MedicationArchiveResult } from '@/lib/medications';
import type { Medication } from '@/types/medications';

/** El archivado solo necesita identificador y nombre; sirve para tarjetas del Home y catálogo completo. */
type ArchiveMedication = Pick<Medication, 'id' | 'name'>;

type ArchiveOptions = {
  confirmationTitle?: string;
  confirmationMessage?: (medication: ArchiveMedication) => string;
  confirmLabel?: string;
  onArchived?: (result: MedicationArchiveResult, medication: ArchiveMedication) => void | Promise<void>;
};

const defaultMessage = (medication: ArchiveMedication) =>
  `¿Mover "${medication.name}" a Archivados? Dejará de aparecer en tu lista activa y en la agenda; sus datos y su historial se conservarán.`;

/**
 * Único flujo de archivado de la app: confirmación, RPC de Supabase,
 * reconciliación de alarmas y protección contra dobles ejecuciones.
 * Cada pantalla decide cómo mostrar el éxito; los errores se exponen aquí.
 */
export function useMedicationArchive(options: ArchiveOptions = {}) {
  const { confirmationTitle = 'Archivar medicamento', confirmationMessage = defaultMessage, confirmLabel = 'Mover a Archivados', onArchived } = options;
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async (medication: ArchiveMedication) => {
    if (pendingRef.current) return;
    pendingRef.current = medication.id;
    setPendingId(medication.id);
    setError(null);

    try {
      const result = await archiveMedication(medication.id, true);
      await reconcileMedicationAlarms();
      await onArchived?.(result, medication);
    } catch (archiveError) {
      if (mountedRef.current) {
        setError(archiveError instanceof Error
          ? archiveError.message
          : 'No pudimos archivar el medicamento. Inténtalo de nuevo.');
      }
    } finally {
      pendingRef.current = null;
      if (mountedRef.current) setPendingId(null);
    }
  }, [onArchived]);

  const requestArchive = useCallback((medication: ArchiveMedication) => {
    if (pendingRef.current) return;
    setError(null);
    Alert.alert(
      confirmationTitle,
      confirmationMessage(medication),
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: confirmLabel, style: 'destructive', onPress: () => void execute(medication) },
      ]
    );
  }, [confirmLabel, confirmationMessage, confirmationTitle, execute]);

  const isPending = useCallback((medicationId: string) => pendingId === medicationId, [pendingId]);
  const clearError = useCallback(() => setError(null), []);

  return { requestArchive, isPending, pendingId, error, clearError };
}
