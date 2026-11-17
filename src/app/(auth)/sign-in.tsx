import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, TextField } from '@/components/form-controls';
import { BrandMark, HealthIllustration, SurfaceCard } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(email, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No pudimos iniciar sesión.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} showsVerticalScrollIndicator={false}>
            <View style={styles.brand}><BrandMark size={64} /><ThemedText type="smallBold" style={styles.brandName}>MediRecord</ThemedText></View>
            <HealthIllustration />
            <View style={styles.intro}>
              <ThemedText type="title" style={styles.title}>Bienvenido de nuevo</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.subtitle}>Tu rutina de salud, organizada con calma y claridad.</ThemedText>
            </View>
            <SurfaceCard style={styles.formCard}>
              <TextField label="Email" value={email} onChangeText={setEmail} placeholder="tu@email.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} editable={!isSubmitting} />
              <TextField ref={passwordRef} label="Contraseña" value={password} onChangeText={setPassword} placeholder="Tu contraseña" secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" returnKeyType="go" onSubmitEditing={() => void handleSubmit()} editable={!isSubmitting} />
              {error ? <ThemedText type="small" style={styles.error}>{error}</ThemedText> : null}
              <ActionButton label="Iniciar sesión" onPress={() => void handleSubmit()} loading={isSubmitting} disabled={!canSubmit} />
            </SurfaceCard>
            <View style={styles.footer}>
              <ThemedText type="small" themeColor="textSecondary">¿Todavía no tienes cuenta?</ThemedText>
              <Link href="/sign-up" asChild><Pressable accessibilityRole="link" disabled={isSubmitting}><ThemedText type="smallBold" style={styles.link}>Crear cuenta</ThemedText></Pressable></Link>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  flex: { flex: 1 },
  content: { alignSelf: 'center', flexGrow: 1, gap: Spacing.three, justifyContent: 'center', maxWidth: MaxContentWidth / 2, paddingBottom: Spacing.five, paddingTop: Spacing.three, width: '100%' },
  brand: { alignItems: 'center', gap: 10 },
  brandName: { color: '#0F766E', fontSize: 17 },
  intro: { gap: 8, paddingTop: Spacing.two },
  title: { fontSize: 34, lineHeight: 39 },
  subtitle: { fontSize: 16, lineHeight: 23 },
  formCard: { gap: Spacing.three, marginTop: Spacing.two },
  error: { color: '#C94A50' },
  footer: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: Spacing.two },
  link: { color: '#0F766E' },
});
