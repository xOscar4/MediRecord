import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  createMedicationPhotoSignedUrl,
  pickMedicationPhoto,
  type MedicationPhotoSource,
  type SelectedMedicationPhoto,
} from '@/lib/medication-photos';
import { ThemedText } from '@/components/themed-text';

type MedicationPhotoSectionProps = {
  selectedPhoto: SelectedMedicationPhoto | null;
  existingPhotoPath?: string | null;
  existingPhotoUrl?: string | null;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  onPhotoSelected: (photo: SelectedMedicationPhoto) => void;
  onCancelSelection: () => void;
  onRemove?: () => void;
  onError?: (message: string) => void;
};

export function useMedicationPhotoUrl(photoPath: string | null): string | null {
  const [loaded, setLoaded] = useState<{ path: string | null; url: string | null }>({ path: photoPath, url: null });

  useEffect(() => {
    let mounted = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function refresh() {
      const nextUrl = await createMedicationPhotoSignedUrl(photoPath);
      if (!mounted) return;
      setLoaded({ path: photoPath, url: nextUrl });
      refreshTimer = setTimeout(() => void refresh(), 50_000);
    }

    if (photoPath) void refresh();

    return () => {
      mounted = false;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [photoPath]);

  return loaded.path === photoPath ? loaded.url : null;
}

export function MedicationPhotoThumbnail({ photoPath, size = 52 }: { photoPath: string | null; size?: number }) {
  const theme = useTheme();
  const signedUrl = useMedicationPhotoUrl(photoPath);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(signedUrl) && failedUrl !== signedUrl;

  return (
    <View style={[styles.thumbnail, { backgroundColor: theme.primarySoft, borderRadius: size / 3, height: size, width: size }]}>
      {showImage ? (
        <Image
          accessibilityLabel="Fotografía del medicamento"
          cachePolicy="none"
          contentFit="cover"
          onError={() => setFailedUrl(signedUrl)}
          source={{ uri: signedUrl ?? undefined }}
          style={[styles.thumbnailImage, { borderRadius: size / 3 }]}
        />
      ) : (
        <AppIcon name={{ ios: 'pills.fill', android: 'medication' }} color={theme.primary} size={size * 0.48} />
      )}
    </View>
  );
}

function PhotoButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: { ios: 'camera' | 'photo'; android: 'photo_camera' | 'photo_library' };
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.photoButton, { backgroundColor: theme.primarySoft, borderColor: theme.primary, opacity: disabled ? 0.45 : pressed ? 0.78 : 1 }]}>
      <AppIcon name={icon} color={theme.primary} size={18} />
      <ThemedText type="smallBold" numberOfLines={1} style={{ color: theme.primary }}>{label}</ThemedText>
    </Pressable>
  );
}

export function MedicationPhotoSection({
  selectedPhoto,
  existingPhotoPath = null,
  existingPhotoUrl = null,
  disabled = false,
  loading = false,
  error = null,
  onPhotoSelected,
  onCancelSelection,
  onRemove,
  onError,
}: MedicationPhotoSectionProps) {
  const theme = useTheme();
  const [pickerLoading, setPickerLoading] = useState(false);
  const previewUri = selectedPhoto?.uri ?? existingPhotoUrl;
  const [failedPreviewUri, setFailedPreviewUri] = useState<string | null>(null);
  const showPreview = Boolean(previewUri) && failedPreviewUri !== previewUri;
  const busy = disabled || loading || pickerLoading;

  async function choose(source: MedicationPhotoSource) {
    if (busy) return;
    setPickerLoading(true);
    onError?.('');
    try {
      const photo = await pickMedicationPhoto(source);
      if (photo) onPhotoSelected(photo);
    } catch (caughtError) {
      onError?.(caughtError instanceof Error ? caughtError.message : 'No pudimos seleccionar la fotografía.');
    } finally {
      setPickerLoading(false);
    }
  }

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <View style={styles.sectionTitleCopy}>
          <ThemedText type="smallBold" themeColor="textSecondary">FOTOGRAFÍA DEL MEDICAMENTO</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Opcional · JPEG, PNG o WEBP · máximo 5 MB</ThemedText>
        </View>
        {pickerLoading || loading ? <ActivityIndicator color={theme.primary} /> : null}
      </View>

      <View style={[styles.preview, { backgroundColor: theme.background, borderColor: theme.border }]}>
        {showPreview ? (
          <Image accessibilityLabel="Vista previa de la fotografía" cachePolicy="none" contentFit="cover" onError={() => setFailedPreviewUri(previewUri)} source={{ uri: previewUri ?? undefined }} style={styles.previewImage} />
        ) : (
          <View style={styles.fallbackPreview}>
            <View style={[styles.fallbackIcon, { backgroundColor: theme.primarySoft }]}>
              <AppIcon name={{ ios: 'camera', android: 'photo_camera' }} color={theme.primary} size={27} />
            </View>
            <ThemedText type="small" themeColor="textSecondary">{existingPhotoPath ? 'No pudimos cargar la fotografía' : 'Aún no has agregado una fotografía'}</ThemedText>
          </View>
        )}
      </View>

      {selectedPhoto ? (
        <View style={[styles.selectionNotice, { backgroundColor: theme.primarySoft }]}>
          <AppIcon name={{ ios: 'checkmark.circle', android: 'check_circle' }} color={theme.primary} size={18} />
          <ThemedText type="small" style={styles.selectionText}>Nueva fotografía lista para guardar ({selectedPhoto.extension.toUpperCase()}).</ThemedText>
        </View>
      ) : existingPhotoPath ? (
        <ThemedText type="small" themeColor="textSecondary">Fotografía guardada de forma privada.</ThemedText>
      ) : null}

      <View style={styles.buttonRow}>
        <PhotoButton icon={{ ios: 'camera', android: 'photo_camera' }} label="Tomar foto" onPress={() => void choose('camera')} disabled={busy} />
        <PhotoButton icon={{ ios: 'photo', android: 'photo_library' }} label="Galería" onPress={() => void choose('library')} disabled={busy} />
      </View>

      {selectedPhoto ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onCancelSelection}
          style={({ pressed }) => [styles.textAction, { opacity: busy ? 0.45 : pressed ? 0.65 : 1 }]}>
          <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>Cancelar selección</ThemedText>
        </Pressable>
      ) : null}

      {onRemove && existingPhotoPath ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onRemove}
          style={({ pressed }) => [styles.textAction, { opacity: busy ? 0.45 : pressed ? 0.65 : 1 }]}>
          <ThemedText type="smallBold" style={{ color: theme.danger }}>Quitar fotografía</ThemedText>
        </Pressable>
      ) : null}

      {error ? (
        <View style={[styles.error, { backgroundColor: `${theme.danger}12` }]}>
          <AppIcon name={{ ios: 'exclamationmark.triangle', android: 'warning' }} color={theme.danger} size={17} />
          <ThemedText type="small" style={[styles.errorText, { color: theme.danger }]}>{error}</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  sectionTitleCopy: { flex: 1, gap: 3 },
  preview: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 178, justifyContent: 'center', overflow: 'hidden', width: '100%' },
  previewImage: { height: '100%', width: '100%' },
  fallbackPreview: { alignItems: 'center', gap: Spacing.two, padding: Spacing.three },
  fallbackIcon: { alignItems: 'center', borderRadius: 18, height: 58, justifyContent: 'center', width: 58 },
  selectionNotice: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, padding: 10 },
  selectionText: { color: '#0F766E', flex: 1 },
  buttonRow: { flexDirection: 'row', gap: Spacing.two },
  photoButton: { alignItems: 'center', borderRadius: 13, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  textAction: { alignSelf: 'flex-start', minHeight: 30, justifyContent: 'center' },
  error: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, padding: 10 },
  errorText: { flex: 1 },
  thumbnail: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbnailImage: { height: '100%', width: '100%' },
});
