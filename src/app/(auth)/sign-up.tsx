import { Link, router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActionButton, TextField } from '@/components/form-controls';
import successAnimation from '@/assets/animations/medirecord-success.json';
import { LottieAnimation } from '@/components/lottie-animation';
import { BrandMark, HealthIllustration, SurfaceCard } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/auth-provider';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const canSubmit = fullName.trim().length > 0 && email.trim().length > 0 && password.length > 0 && !isSubmitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const { requiresEmailConfirmation } = await signUp({ fullName, email, password });
      if (requiresEmailConfirmation) setPendingEmail(email.trim());
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No pudimos crear tu cuenta.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (pendingEmail) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
           <View style={styles.confirmation}><LottieAnimation source={successAnimation} size={92} loop={false} accessibilityLabel="Registro completado" /><BrandMark size={64} /><ThemedText type="title" style={styles.title}>Revisa tu correo</ThemedText><ThemedText themeColor="textSecondary" style={styles.centerText}>Enviamos un enlace de confirmación a {pendingEmail}. Confirma tu cuenta y vuelve aquí para iniciar sesión.</ThemedText><ActionButton label="Ir a iniciar sesión" onPress={() => router.replace('/sign-in')} /></View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} showsVerticalScrollIndicator={false}>
            <View style={styles.brand}><BrandMark size={64} /><ThemedText type="smallBold" style={styles.brandName}>MediRecord</ThemedText></View>
            <HealthIllustration />
            <View style={styles.intro}><ThemedText type="title" style={styles.title}>Crea tu espacio</ThemedText><ThemedText themeColor="textSecondary" style={styles.subtitle}>Empieza a cuidar tus rutinas con una vista más sencilla.</ThemedText></View>
            <SurfaceCard style={styles.formCard}>
              <TextField label="Nombre" value={fullName} onChangeText={setFullName} placeholder="Cómo quieres que te llamemos" autoCapitalize="words" autoComplete="name" textContentType="name" maxLength={120} returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} editable={!isSubmitting} />
              <TextField ref={emailRef} label="Email" value={email} onChangeText={setEmail} placeholder="tu@email.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => passwordRef.current?.focus()} editable={!isSubmitting} />
              <TextField ref={passwordRef} label="Contraseña" value={password} onChangeText={setPassword} placeholder="Mínimo 6 caracteres" hint="Usa al menos 6 caracteres." secureTextEntry autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={() => void handleSubmit()} editable={!isSubmitting} />
              {error ? <ThemedText type="small" style={styles.error}>{error}</ThemedText> : null}
              <ActionButton label="Crear cuenta" onPress={() => void handleSubmit()} loading={isSubmitting} disabled={!canSubmit} />
            </SurfaceCard>
            <View style={styles.footer}><ThemedText type="small" themeColor="textSecondary">¿Ya tienes cuenta?</ThemedText><Link href="/sign-in" asChild><Pressable accessibilityRole="link" disabled={isSubmitting}><ThemedText type="smallBold" style={styles.link}>Iniciar sesión</ThemedText></Pressable></Link></View>
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
  confirmation: { alignSelf: 'center', gap: Spacing.three, justifyContent: 'center', maxWidth: MaxContentWidth / 2, paddingHorizontal: Spacing.four, width: '100%' },
  centerText: { textAlign: 'center' },
});
