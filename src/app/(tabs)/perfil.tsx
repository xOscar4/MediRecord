import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, TextField } from '@/components/form-controls';
import { AlarmPermissionSettings } from '@/components/alarm-permission-settings';
import { AppIcon, BrandMark, SectionLabel, StatusPill, SurfaceCard } from '@/components/ui-kit';
import { TimezonePickerModal } from '@/components/timezone-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getDeviceTimezone, useAuth } from '@/providers/auth-provider';
import { reconcileMedicationAlarms } from '@/lib/medication-alarm-reconciler';

type Feedback = { tone: 'ok' | 'error'; text: string } | null;

function FeedbackText({ feedback }: { feedback: Feedback }) {
  const theme = useTheme();
  if (!feedback) return null;
  return <ThemedText type="small" style={{ color: feedback.tone === 'ok' ? theme.success : theme.danger }}>{feedback.text}</ThemedText>;
}

export default function PerfilScreen() {
  const { user, profile, isProfileLoading, profileError, updateFullName, updateTimezone, refreshProfile, signOut } = useAuth();
  const theme = useTheme();
  const profileName = profile?.full_name ?? '';
  const profileTimezone = profile?.timezone ?? '';
  const deviceTimezone = getDeviceTimezone();
  const [fullNameDraft, setFullNameDraft] = useState<string | null>(null);
  const [nameFeedback, setNameFeedback] = useState<Feedback>(null);
  const [timezoneFeedback, setTimezoneFeedback] = useState<Feedback>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingTimezone, setIsSavingTimezone] = useState(false);
  const [isTimezonePickerVisible, setIsTimezonePickerVisible] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const fullName = fullNameDraft ?? profileName;
  const initial = (profileName || user?.email || 'M').charAt(0).toUpperCase();

  async function handleSaveName() {
    setNameFeedback(null); setIsSavingName(true);
    try { await updateFullName(fullName); setFullNameDraft(null); setNameFeedback({ tone: 'ok', text: 'Nombre actualizado.' }); }
    catch (error) { setNameFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No pudimos guardar el nombre.' }); }
    finally { setIsSavingName(false); }
  }

  async function handleTimezoneConfirm(candidateTimezone: string) {
    const candidate = candidateTimezone.trim();
    setTimezoneFeedback(null); setIsSavingTimezone(true);
    try { await updateTimezone(candidate); await reconcileMedicationAlarms(); setTimezoneFeedback({ tone: 'ok', text: 'Zona horaria actualizada.' }); }
    catch (error) {
      const message = error instanceof Error ? error.message : 'No pudimos guardar la zona horaria.';
      setTimezoneFeedback({ tone: 'error', text: message });
      throw error;
    }
    finally { setIsSavingTimezone(false); }
  }

  async function handleUseDeviceTimezone() {
    if (!deviceTimezone) return;
    try { await handleTimezoneConfirm(deviceTimezone); } catch { /* El mensaje ya se muestra en la tarjeta. */ }
  }

  async function performSignOut() {
    setIsSigningOut(true);
    try { await signOut(); }
    catch (error) { Alert.alert('No pudimos cerrar sesión', error instanceof Error ? error.message : 'Inténtalo de nuevo.'); }
    finally { setIsSigningOut(false); }
  }

  function handleSignOut() {
    Alert.alert('Cerrar sesión', '¿Seguro que quieres salir de MediRecord?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void performSignOut() },
    ]);
  }

  if (isProfileLoading && !profile) {
    return <ThemedView style={styles.centered}><ActivityIndicator color={theme.primary} /><ThemedText type="small" themeColor="textSecondary">Cargando tu perfil…</ThemedText></ThemedView>;
  }

  if (!profile && profileError) {
    return <ThemedView style={styles.centered}><AppIcon name={{ ios: 'exclamationmark.triangle', android: 'warning' }} color={theme.danger} size={34} /><ThemedText type="smallBold" style={{ color: theme.danger, textAlign: 'center' }}>{profileError}</ThemedText><ActionButton label="Reintentar" onPress={() => void refreshProfile()} tone="neutral" /></ThemedView>;
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.pageHeader}><View><ThemedText type="small" themeColor="textSecondary">CUENTA PERSONAL</ThemedText><ThemedText type="title" style={styles.pageTitle}>Perfil</ThemedText></View><BrandMark size={48} /></View>
            <SurfaceCard style={styles.accountCard}>
              <View style={[styles.avatar, { backgroundColor: theme.primary }]}><ThemedText style={styles.avatarText}>{initial}</ThemedText></View>
              <View style={styles.accountCopy}><ThemedText type="smallBold">{profileName || 'Tu perfil'}</ThemedText><ThemedText type="small" themeColor="textSecondary" selectable>{user?.email ?? '—'}</ThemedText></View>
              <StatusPill label="Activo" tone="success" />
            </SurfaceCard>

            <View style={styles.sectionHeader}><SectionLabel>Información visible</SectionLabel><ThemedText type="small" themeColor="textSecondary">Solo tú puedes verla</ThemedText></View>
            <SurfaceCard style={styles.formCard}>
              <View style={styles.cardHeading}><AppIcon name={{ ios: 'person.text.rectangle', android: 'badge' }} color={theme.primary} size={22} /><ThemedText type="subtitle" style={styles.cardTitle}>Tu nombre</ThemedText></View>
              <TextField label="Nombre visible" value={fullName} onChangeText={setFullNameDraft} placeholder="Cómo quieres que te llamemos" autoCapitalize="words" maxLength={120} editable={!isSavingName} />
              <FeedbackText feedback={nameFeedback} />
              <ActionButton label="Guardar nombre" onPress={() => void handleSaveName()} loading={isSavingName} disabled={fullName.trim().length === 0 || fullName.trim() === profileName} />
            </SurfaceCard>

            <SurfaceCard style={styles.formCard}>
              <View style={styles.cardHeading}><AppIcon name={{ ios: 'globe.americas.fill', android: 'public' }} color={theme.primary} size={22} /><ThemedText type="subtitle" style={styles.cardTitle}>Zona horaria</ThemedText></View>
              <ThemedText type="small" themeColor="textSecondary">Se usa para calcular tu fecha local y organizar las tomas pendientes.</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="Seleccionar zona horaria" disabled={isSavingTimezone} onPress={() => setIsTimezonePickerVisible(true)} style={({ pressed }) => [styles.timezoneOption, { backgroundColor: theme.background, borderColor: theme.border, opacity: pressed ? 0.78 : 1 }]}>
                <View style={styles.timezoneCopy}><ThemedText type="smallBold">Zona actual</ThemedText><ThemedText type="small" themeColor="textSecondary">{profileTimezone || 'UTC'}</ThemedText></View>
                <AppIcon name={{ ios: 'chevron.right', android: 'chevron_right' }} color={theme.textSecondary} size={20} />
              </Pressable>
              <FeedbackText feedback={timezoneFeedback} />
              <ActionButton label={deviceTimezone ? `Usar ${deviceTimezone}` : 'Zona del dispositivo no disponible'} tone="neutral" onPress={() => void handleUseDeviceTimezone()} loading={isSavingTimezone} disabled={!deviceTimezone || isSavingTimezone || deviceTimezone === profileTimezone} />
            </SurfaceCard>

            <AlarmPermissionSettings />

            <ActionButton label="Cerrar sesión" tone="danger" onPress={handleSignOut} loading={isSigningOut} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <TimezonePickerModal visible={isTimezonePickerVisible} selectedTimezone={profileTimezone} onClose={() => setIsTimezonePickerVisible(false)} onConfirm={handleTimezoneConfirm} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  safeArea: { flex: 1 },
  content: { alignSelf: 'center', gap: Spacing.three, maxWidth: MaxContentWidth, paddingHorizontal: Spacing.four, paddingBottom: BottomTabInset + Spacing.five, paddingTop: Spacing.two, width: '100%' },
  pageHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  pageTitle: { fontSize: 34, lineHeight: 39, marginTop: 2 },
  accountCard: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  avatar: { alignItems: 'center', borderRadius: 99, height: 48, justifyContent: 'center', width: 48 },
  avatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  accountCopy: { flex: 1, gap: 2 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: Spacing.two },
  formCard: { gap: Spacing.three },
  cardHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  cardTitle: { fontSize: 23, lineHeight: 29 },
  timezoneOption: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', minHeight: 62, paddingHorizontal: 14 },
  timezoneCopy: { flex: 1, gap: 3 },
  centered: { alignItems: 'center', flex: 1, gap: Spacing.three, justifyContent: 'center', padding: Spacing.four },
});
