import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

export const MEDICATION_PHOTO_BUCKET = 'medication-photos';
export const MEDICATION_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const MEDICATION_PHOTO_SIGNED_URL_SECONDS = 60;

export type MedicationPhotoExtension = 'jpg' | 'png' | 'webp';
export type MedicationPhotoMimeType = 'image/jpeg' | 'image/png' | 'image/webp';

export type SelectedMedicationPhoto = {
  uri: string;
  mimeType: MedicationPhotoMimeType;
  extension: MedicationPhotoExtension;
  fileSize: number | null;
};

export type MedicationPhotoSource = 'camera' | 'library';

export class MedicationPhotoError extends Error {
  readonly code: 'permission' | 'invalid' | 'storage' | 'auth';

  constructor(message: string, code: 'permission' | 'invalid' | 'storage' | 'auth' = 'storage') {
    super(message);
    this.name = 'MedicationPhotoError';
    this.code = code;
  }
}

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null;
}

function permissionMessage(source: MedicationPhotoSource, canAskAgain: boolean): string {
  const resource = source === 'camera' ? 'la cámara' : 'la galería';
  return canAskAgain
    ? `No se concedió permiso para ${resource}. Puedes continuar sin fotografía o intentarlo de nuevo.`
    : `El permiso para ${resource} está denegado. Actívalo desde los ajustes del dispositivo o continúa sin fotografía.`;
}

function extensionFromName(value: string): MedicationPhotoExtension | null {
  const extension = value.toLowerCase().split('?')[0]?.split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'jpg';
  if (extension === 'png') return 'png';
  if (extension === 'webp') return 'webp';
  return null;
}

function mimeAndExtension(asset: ImagePicker.ImagePickerAsset): { mimeType: MedicationPhotoMimeType; extension: MedicationPhotoExtension } | null {
  const mimeType = asset.mimeType?.toLowerCase();
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (mimeType === 'image/png') return { mimeType: 'image/png', extension: 'png' };
  if (mimeType === 'image/webp') return { mimeType: 'image/webp', extension: 'webp' };

  const extension = extensionFromName(asset.fileName ?? asset.uri);
  if (extension === 'jpg') return { mimeType: 'image/jpeg', extension };
  if (extension === 'png') return { mimeType: 'image/png', extension };
  if (extension === 'webp') return { mimeType: 'image/webp', extension };
  return null;
}

function validateAsset(asset: ImagePicker.ImagePickerAsset): SelectedMedicationPhoto {
  if (asset.type && asset.type !== 'image') {
    throw new MedicationPhotoError('Selecciona una imagen JPEG, PNG o WEBP.', 'invalid');
  }

  const format = mimeAndExtension(asset);
  if (!format) {
    throw new MedicationPhotoError('El formato no es compatible. Usa una imagen JPEG, PNG o WEBP.', 'invalid');
  }

  if (typeof asset.fileSize === 'number' && asset.fileSize > MEDICATION_PHOTO_MAX_BYTES) {
    throw new MedicationPhotoError('La fotografía supera el límite de 5 MB.', 'invalid');
  }

  return {
    uri: asset.uri,
    mimeType: format.mimeType,
    extension: format.extension,
    fileSize: typeof asset.fileSize === 'number' ? asset.fileSize : null,
  };
}

export async function pickMedicationPhoto(source: MedicationPhotoSource): Promise<SelectedMedicationPhoto | null> {
  try {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      throw new MedicationPhotoError(permissionMessage(source, permission.canAskAgain), 'permission');
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          allowsEditing: true,
          aspect: [4, 3],
          mediaTypes: ['images'],
          quality: 0.85,
        })
      : await ImagePicker.launchImageLibraryAsync({
          allowsEditing: true,
          aspect: [4, 3],
          mediaTypes: ['images'],
          quality: 0.85,
          selectionLimit: 1,
        });

    if (result.canceled || !result.assets[0]) return null;
    return validateAsset(result.assets[0]);
  } catch (error) {
    if (error instanceof MedicationPhotoError) throw error;
    throw new MedicationPhotoError('No pudimos abrir la cámara o la galería. Inténtalo de nuevo.', 'storage');
  }
}

async function getAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new MedicationPhotoError('Tu sesión no está disponible. Vuelve a iniciar sesión.', 'auth');
  }
  return data.user;
}

function pathForPhoto(userId: string, medicationId: string, extension: MedicationPhotoExtension): string {
  return `${userId}/${medicationId}/photo.${extension}`;
}

function filenameFromPath(path: string): string | null {
  const filename = path.split('/').pop();
  return filename === 'photo.jpg' || filename === 'photo.png' || filename === 'photo.webp' ? filename : null;
}

function isOwnedPhotoPath(path: string, userId: string): boolean {
  return new RegExp(`^${userId}/[^/]+/photo\\.(jpg|png|webp)$`).test(path);
}

function storageErrorMessage(error: { message?: string } | null, fallback: string): string {
  const message = error?.message?.toLowerCase() ?? '';
  if (message.includes('size') || message.includes('large')) return 'La fotografía supera el límite de 5 MB.';
  if (message.includes('mime') || message.includes('type')) return 'El formato no es compatible. Usa una imagen JPEG, PNG o WEBP.';
  return fallback;
}

async function removePhotoObject(path: string, userId: string): Promise<void> {
  if (!isOwnedPhotoPath(path, userId)) {
    throw new MedicationPhotoError('La ruta de la fotografía no es válida para esta cuenta.', 'storage');
  }

  const { error } = await supabase.storage.from(MEDICATION_PHOTO_BUCKET).remove([path]);
  if (error) {
    throw new MedicationPhotoError(
      storageErrorMessage(error, 'No pudimos eliminar el archivo de la fotografía. Inténtalo de nuevo.'),
      'storage'
    );
  }
}

async function setPhotoReference(medicationId: string, filename: string): Promise<string> {
  const { data, error } = await supabase.rpc('set_medication_photo', {
    p_medication_id: medicationId,
    p_filename: filename,
  });

  if (error || !isRecord(data) || typeof data.photo_path !== 'string') {
    throw new MedicationPhotoError(
      error?.code === '42501'
        ? 'No tienes permiso para modificar esta fotografía.'
        : storageErrorMessage(error, 'No pudimos registrar la fotografía del medicamento.'),
      'storage'
    );
  }

  return data.photo_path;
}

async function clearPhotoReference(medicationId: string): Promise<{ path: string | null; alreadyClear: boolean }> {
  const { data, error } = await supabase.rpc('clear_medication_photo', {
    p_medication_id: medicationId,
  });

  if (error || !isRecord(data)) {
    throw new MedicationPhotoError(
      error?.code === '42501'
        ? 'No tienes permiso para modificar esta fotografía.'
        : storageErrorMessage(error, 'No pudimos quitar la fotografía. Inténtalo de nuevo.'),
      'storage'
    );
  }

  const path = typeof data.photo_path === 'string' ? data.photo_path : null;
  return { path, alreadyClear: data.already_clear === true };
}

async function restorePhotoReference(medicationId: string, path: string, userId: string): Promise<boolean> {
  const filename = filenameFromPath(path);
  if (!filename || !isOwnedPhotoPath(path, userId)) return false;

  try {
    await setPhotoReference(medicationId, filename);
    return true;
  } catch {
    return false;
  }
}

async function readPhotoBytes(photo: SelectedMedicationPhoto): Promise<ArrayBuffer> {
  let response: Response;
  try {
    response = await fetch(photo.uri);
  } catch {
    throw new MedicationPhotoError('No pudimos leer la fotografía seleccionada.', 'storage');
  }

  if (!response.ok) {
    throw new MedicationPhotoError('No pudimos leer la fotografía seleccionada.', 'storage');
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await response.arrayBuffer();
  } catch {
    throw new MedicationPhotoError('No pudimos preparar la fotografía para subirla.', 'storage');
  }

  if (bytes.byteLength > MEDICATION_PHOTO_MAX_BYTES) {
    throw new MedicationPhotoError('La fotografía supera el límite de 5 MB.', 'invalid');
  }
  return bytes;
}

export async function saveMedicationPhoto(
  medicationId: string,
  photo: SelectedMedicationPhoto,
  existingPhotoPath: string | null,
): Promise<string> {
  const user = await getAuthenticatedUser();
  const bytes = await readPhotoBytes(photo);
  const path = pathForPhoto(user.id, medicationId, photo.extension);
  let previousPath = existingPhotoPath;

  if (previousPath) {
    if (!isOwnedPhotoPath(previousPath, user.id)) {
      throw new MedicationPhotoError('La fotografía actual no pertenece a esta cuenta.', 'storage');
    }

    const cleared = await clearPhotoReference(medicationId);
    previousPath = cleared.path ?? previousPath;
    if (previousPath && !cleared.alreadyClear) {
      try {
        await removePhotoObject(previousPath, user.id);
      } catch {
        const restored = await restorePhotoReference(medicationId, previousPath, user.id);
        if (restored) {
          throw new MedicationPhotoError('No pudimos reemplazar la fotografía. La imagen anterior se conservó.', 'storage');
        }
        throw new MedicationPhotoError('No pudimos reemplazar la fotografía. La referencia anterior quedó desvinculada; inténtalo de nuevo.', 'storage');
      }
    }
  }

  const { error: uploadError } = await supabase.storage.from(MEDICATION_PHOTO_BUCKET).upload(path, bytes, {
    cacheControl: '3600',
    contentType: photo.mimeType,
    upsert: false,
  });

  if (uploadError) {
    throw new MedicationPhotoError(
      storageErrorMessage(uploadError, 'No pudimos subir la nueva fotografía. La fotografía anterior ya no está vinculada.'),
      'storage'
    );
  }

  try {
    const savedPath = await setPhotoReference(medicationId, `photo.${photo.extension}`);
    if (savedPath !== path) {
      throw new MedicationPhotoError('La ruta registrada de la fotografía no coincide con la esperada.', 'storage');
    }
    return savedPath;
  } catch (error) {
    try {
      await removePhotoObject(path, user.id);
    } catch {
      // La referencia no queda apuntando al archivo nuevo; el objeto podrá limpiarse como huérfano.
    }
    throw error;
  }
}

export async function clearMedicationPhoto(medicationId: string): Promise<void> {
  const user = await getAuthenticatedUser();
  const cleared = await clearPhotoReference(medicationId);
  if (cleared.alreadyClear || !cleared.path) return;

  try {
    await removePhotoObject(cleared.path, user.id);
  } catch {
    const restored = await restorePhotoReference(medicationId, cleared.path, user.id);
    if (restored) {
      throw new MedicationPhotoError('No pudimos quitar la fotografía. La imagen se conservó.', 'storage');
    }
    throw new MedicationPhotoError('No pudimos eliminar el archivo de la fotografía. La referencia quedó desvinculada; inténtalo de nuevo.', 'storage');
  }
}

export async function createMedicationPhotoSignedUrl(photoPath: string | null): Promise<string | null> {
  if (!photoPath) return null;
  const user = await getAuthenticatedUser();
  if (!isOwnedPhotoPath(photoPath, user.id)) return null;

  const { data, error } = await supabase.storage
    .from(MEDICATION_PHOTO_BUCKET)
    .createSignedUrl(photoPath, MEDICATION_PHOTO_SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
