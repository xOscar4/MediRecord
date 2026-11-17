import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton } from '@/components/form-controls';
import { AppIcon } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type TimezoneOption = {
  id: string;
  city: string;
  label: string;
};

const TIMEZONES: TimezoneOption[] = [
  { id: 'UTC', city: 'UTC', label: 'UTC (UTC)' },
  { id: 'America/Guayaquil', city: 'Quito', label: 'Quito (America/Guayaquil)' },
  { id: 'America/Bogota', city: 'Bogotá', label: 'Bogotá (America/Bogota)' },
  { id: 'America/Lima', city: 'Lima', label: 'Lima (America/Lima)' },
  { id: 'America/Mexico_City', city: 'Ciudad de México', label: 'Ciudad de México (America/Mexico_City)' },
  { id: 'America/New_York', city: 'Nueva York', label: 'Nueva York (America/New_York)' },
  { id: 'America/Chicago', city: 'Chicago', label: 'Chicago (America/Chicago)' },
  { id: 'America/Denver', city: 'Denver', label: 'Denver (America/Denver)' },
  { id: 'America/Los_Angeles', city: 'Los Ángeles', label: 'Los Ángeles (America/Los_Angeles)' },
  { id: 'America/Toronto', city: 'Toronto', label: 'Toronto (America/Toronto)' },
  { id: 'America/Sao_Paulo', city: 'São Paulo', label: 'São Paulo (America/Sao_Paulo)' },
  { id: 'America/Argentina/Buenos_Aires', city: 'Buenos Aires', label: 'Buenos Aires (America/Argentina/Buenos_Aires)' },
  { id: 'America/Santiago', city: 'Santiago', label: 'Santiago (America/Santiago)' },
  { id: 'Europe/Madrid', city: 'Madrid', label: 'Madrid (Europe/Madrid)' },
  { id: 'Europe/London', city: 'Londres', label: 'Londres (Europe/London)' },
  { id: 'Europe/Paris', city: 'París', label: 'París (Europe/Paris)' },
  { id: 'Europe/Rome', city: 'Roma', label: 'Roma (Europe/Rome)' },
  { id: 'Europe/Berlin', city: 'Berlín', label: 'Berlín (Europe/Berlin)' },
  { id: 'Europe/Lisbon', city: 'Lisboa', label: 'Lisboa (Europe/Lisbon)' },
  { id: 'Africa/Cairo', city: 'El Cairo', label: 'El Cairo (Africa/Cairo)' },
  { id: 'Africa/Johannesburg', city: 'Johannesburgo', label: 'Johannesburgo (Africa/Johannesburg)' },
  { id: 'Asia/Dubai', city: 'Dubái', label: 'Dubái (Asia/Dubai)' },
  { id: 'Asia/Kolkata', city: 'Calcuta', label: 'Calcuta (Asia/Kolkata)' },
  { id: 'Asia/Bangkok', city: 'Bangkok', label: 'Bangkok (Asia/Bangkok)' },
  { id: 'Asia/Singapore', city: 'Singapur', label: 'Singapur (Asia/Singapore)' },
  { id: 'Asia/Shanghai', city: 'Shanghái', label: 'Shanghái (Asia/Shanghai)' },
  { id: 'Asia/Tokyo', city: 'Tokio', label: 'Tokio (Asia/Tokyo)' },
  { id: 'Asia/Seoul', city: 'Seúl', label: 'Seúl (Asia/Seoul)' },
  { id: 'Australia/Sydney', city: 'Sídney', label: 'Sídney (Australia/Sydney)' },
  { id: 'Pacific/Auckland', city: 'Auckland', label: 'Auckland (Pacific/Auckland)' },
];

const AVAILABLE_TIMEZONES: TimezoneOption[] = (() => {
  const featured = new Map(TIMEZONES.map((timezone) => [timezone.id, timezone]));
  const intlWithTimezones = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  let ids = TIMEZONES.map((timezone) => timezone.id);

  try {
    if (intlWithTimezones.supportedValuesOf) ids = ['UTC', ...intlWithTimezones.supportedValuesOf('timeZone')];
  } catch {
    // La lista curada funciona como fallback en runtimes sin supportedValuesOf.
  }

  return Array.from(new Set(ids)).map((id) => {
    const known = featured.get(id);
    if (known) return known;
    const city = id.split('/').pop()?.replace(/_/g, ' ') ?? id;
    return { id, city, label: `${city} (${id})` };
  });
})();

type TimezonePickerModalProps = {
  visible: boolean;
  selectedTimezone: string;
  onClose: () => void;
  onConfirm: (timezone: string) => Promise<void>;
};

export function TimezonePickerModal({ visible, selectedTimezone, onClose, onConfirm }: TimezonePickerModalProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [pendingTimezone, setPendingTimezone] = useState(selectedTimezone || 'UTC');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTimezones = useMemo(() => {
    if (!selectedTimezone || AVAILABLE_TIMEZONES.some((timezone) => timezone.id === selectedTimezone)) return AVAILABLE_TIMEZONES;
    const city = selectedTimezone.split('/').pop()?.replace(/_/g, ' ') ?? selectedTimezone;
    return [{ id: selectedTimezone, city, label: `${city} (${selectedTimezone})` }, ...AVAILABLE_TIMEZONES];
  }, [selectedTimezone]);

  const filteredTimezones = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return availableTimezones;
    return availableTimezones.filter((timezone) => timezone.label.toLocaleLowerCase().includes(normalizedQuery));
  }, [availableTimezones, query]);

  async function handleConfirm() {
    setError(null);
    setIsSaving(true);
    try {
      await onConfirm(pendingTimezone);
      onClose();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'No pudimos guardar la zona horaria.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={isSaving ? undefined : onClose}>
      <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar selector" style={[styles.backdrop, { backgroundColor: theme.overlay }]} onPress={isSaving ? undefined : onClose} />
        <KeyboardAvoidingView style={styles.sheetPosition} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <SafeAreaView style={[styles.sheet, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleRow}>
                <View style={[styles.sheetIcon, { backgroundColor: theme.primarySoft }]}><AppIcon name={{ ios: 'globe.americas.fill', android: 'public' }} color={theme.primary} size={22} /></View>
                <View style={styles.sheetTitleCopy}><ThemedText type="subtitle" style={styles.title}>Zona horaria</ThemedText><ThemedText type="small" themeColor="textSecondary">Selecciona tu ciudad o región.</ThemedText></View>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar" disabled={isSaving} onPress={onClose} hitSlop={12} style={styles.closeButton}><AppIcon name={{ ios: 'xmark', android: 'close' }} color={theme.textSecondary} size={22} /></Pressable>
            </View>
            <View style={[styles.searchBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <AppIcon name={{ ios: 'magnifyingglass', android: 'search' }} color={theme.textSecondary} size={19} />
              <TextInput value={query} onChangeText={setQuery} placeholder="Buscar ciudad o zona" placeholderTextColor={theme.textSecondary} style={[styles.searchInput, { color: theme.text }]} autoCapitalize="none" autoCorrect={false} returnKeyType="search" editable={!isSaving} />
            </View>
            <ThemedText type="small" themeColor="textSecondary" style={styles.currentLabel}>Seleccionada: <ThemedText type="smallBold">{selectedTimezone || 'UTC'}</ThemedText></ThemedText>
            <FlatList
              data={filteredTimezones}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = item.id === pendingTimezone;
                return (
                  <Pressable accessibilityRole="radio" accessibilityState={{ checked: isSelected }} onPress={() => setPendingTimezone(item.id)} style={({ pressed }) => [styles.option, { backgroundColor: isSelected ? theme.primarySoft : 'transparent', opacity: pressed ? 0.75 : 1 }]}>
                    <View style={styles.optionCopy}><ThemedText type="smallBold">{item.city}</ThemedText><ThemedText type="small" themeColor="textSecondary">{item.id}</ThemedText></View>
                    {isSelected ? <AppIcon name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} color={theme.primary} size={22} /> : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={<ThemedText type="small" themeColor="textSecondary" style={styles.empty}>No encontramos esa zona horaria.</ThemedText>}
            />
            {error ? <ThemedText type="small" style={[styles.error, { color: theme.danger }]}>{error}</ThemedText> : null}
            <View style={styles.footer}>
              {isSaving ? <ActivityIndicator color={theme.primary} /> : null}
              <ActionButton label={isSaving ? 'Guardando…' : 'Confirmar zona horaria'} onPress={() => void handleConfirm()} loading={isSaving} disabled={!pendingTimezone || isSaving} />
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill },
  sheetPosition: { maxHeight: '88%', width: '100%' },
  sheet: { borderTopLeftRadius: Radius.xl, borderTopRightRadius: Radius.xl, borderTopWidth: 1, gap: Spacing.two, minHeight: 480, overflow: 'hidden', paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  sheetHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  sheetTitleRow: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 12 },
  sheetIcon: { alignItems: 'center', borderRadius: 14, height: 42, justifyContent: 'center', width: 42 },
  sheetTitleCopy: { flex: 1, gap: 2 },
  title: { fontSize: 24, lineHeight: 29 },
  closeButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 },
  searchBox: { alignItems: 'center', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 48, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 16, minHeight: 46 },
  currentLabel: { paddingTop: 2 },
  listContent: { gap: 6, paddingBottom: 8 },
  list: { flex: 1 },
  option: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', minHeight: 58, paddingHorizontal: 14 },
  optionCopy: { flex: 1, gap: 2 },
  empty: { padding: Spacing.four, textAlign: 'center' },
  error: { textAlign: 'center' },
  footer: { alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.two, paddingTop: Spacing.one },
});
