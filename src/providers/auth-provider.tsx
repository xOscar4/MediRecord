import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/lib/supabase';
import MedicationAlarm from '@modules/medication-alarm';

export type Profile = {
  id: string;
  full_name: string;
  timezone: string;
};

type SignUpInput = {
  fullName: string;
  email: string;
  password: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isInitializing: boolean;
  isProfileLoading: boolean;
  profileError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<{ requiresEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  updateFullName: (fullName: string) => Promise<void>;
  updateTimezone: (timezone: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_ERROR = 'Ocurrió un error inesperado. Inténtalo de nuevo.';

/** Zona IANA del dispositivo, o null si el runtime no la expone. */
export function getDeviceTimezone(): string | null {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timeZone && timeZone.length > 0 ? timeZone : null;
  } catch {
    return null;
  }
}

function toProfile(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null;
  const candidate = row as Record<string, unknown>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.full_name !== 'string' ||
    typeof candidate.timezone !== 'string'
  ) {
    return null;
  }
  return {
    id: candidate.id,
    full_name: candidate.full_name,
    timezone: candidate.timezone,
  };
}

function translateAuthError(error: unknown): string {
  if (!error || typeof error !== 'object') return DEFAULT_ERROR;

  const { code, message } = error as { code?: string; message?: string };
  const normalized = (message ?? '').toLowerCase();

  switch (code) {
    case 'invalid_credentials':
      return 'Email o contraseña incorrectos.';
    case 'email_not_confirmed':
      return 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja.';
    case 'user_already_exists':
    case 'email_exists':
      return 'Ya existe una cuenta con ese email. Inicia sesión.';
    case 'weak_password':
      return 'La contraseña es demasiado débil. Usa al menos 6 caracteres.';
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Se enviaron demasiadas solicitudes. Espera unos minutos e inténtalo otra vez.';
    case 'validation_failed':
      return 'Revisa los datos: el email o la contraseña no son válidos.';
    case 'same_password':
      return 'La nueva contraseña debe ser distinta a la anterior.';
    default:
      break;
  }

  if (normalized.includes('invalid login credentials')) {
    return 'Email o contraseña incorrectos.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja.';
  }
  if (normalized.includes('already registered') || normalized.includes('already exists')) {
    return 'Ya existe una cuenta con ese email. Inicia sesión.';
  }
  if (normalized.includes('password')) {
    return 'La contraseña no cumple los requisitos mínimos (6 caracteres).';
  }

  return message && message.length > 0 ? message : DEFAULT_ERROR;
}

function translateProfileError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'No pudimos completar la operación con tu perfil.';
  }

  const { code, message } = error as { code?: string; message?: string };

  switch (code) {
    case '42501':
      return 'No tienes permiso para esta operación.';
    case '22023':
      return 'El valor no es válido. Revisa la zona horaria.';
    case '23514':
      return 'Los datos no son válidos. Revisa el nombre.';
    case 'PGRST116':
      return 'No encontramos tu perfil en la base de datos.';
    case 'PGRST301':
    case 'PGRST302':
      return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    default:
      return message && message.length > 0
        ? message
        : 'No pudimos completar la operación con tu perfil.';
  }
}

type ProfileSnapshot = {
  userId: string;
  profile: Profile | null;
  error: string | null;
  status: 'loading' | 'ready';
};

const PROFILE_NOT_FOUND = 'No encontramos tu perfil. Cierra sesión y vuelve a entrar.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [profileSnapshot, setProfileSnapshot] = useState<ProfileSnapshot | null>(null);

  const userId = session?.user?.id ?? null;

  // El perfil pertenece a un usuario concreto: si cambia la sesión se descarta.
  // Se deriva en el render para no reiniciar estado dentro de un efecto.
  const snapshot = userId !== null && profileSnapshot?.userId === userId ? profileSnapshot : null;
  const profile = snapshot?.profile ?? null;
  const profileError = snapshot?.error ?? null;
  const isProfileLoading =
    userId !== null && (snapshot === null || snapshot.status === 'loading');

  // Sesión inicial + escucha de cambios. Sin consultas a Supabase dentro del callback.
  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session ?? null);
      })
      .catch(() => {
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setIsInitializing(false);
      });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(async (id: string): Promise<Profile | null> => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, timezone')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return toProfile(data);
  }, []);

  // Carga del perfil cuando cambia el usuario autenticado. Solo se escribe
  // estado en los callbacks asíncronos, nunca en el cuerpo del efecto.
  useEffect(() => {
    if (!userId) return;

    let active = true;

    loadProfile(userId)
      .then((next) => {
        if (!active) return;
        setProfileSnapshot({
          userId,
          profile: next,
          error: next ? null : PROFILE_NOT_FOUND,
          status: 'ready',
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setProfileSnapshot({
          userId,
          profile: null,
          error: translateProfileError(error),
          status: 'ready',
        });
      });

    return () => {
      active = false;
    };
  }, [userId, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) throw new Error(translateAuthError(error));
  }, []);

  const signUp = useCallback(async ({ fullName, email, password }: SignUpInput) => {
    const name = fullName.trim();
    if (name.length < 1 || name.length > 120) {
      throw new Error('Escribe un nombre de entre 1 y 120 caracteres.');
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: name,
          timezone: getDeviceTimezone() ?? 'UTC',
        },
      },
    });

    if (error) throw new Error(translateAuthError(error));

    // Supabase oculta los emails existentes devolviendo un usuario sin identidades.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('Ya existe una cuenta con ese email. Inicia sesión.');
    }

    return { requiresEmailConfirmation: !data.session };
  }, []);

  const signOut = useCallback(async () => {
    if (userId && MedicationAlarm.available) {
      try {
        const cleared = await MedicationAlarm.clearUserAlarms(userId);
        if (!cleared) throw new Error('clearUserAlarms returned false');
      } catch (error) {
        console.warn('[MediRecord] No se pudieron limpiar las alarmas antes de cerrar sesión.', error);
        throw new Error('No pudimos detener y limpiar tus alarmas antes de cerrar sesión. Inténtalo de nuevo.');
      }
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(translateAuthError(error));
    setProfileSnapshot(null);
  }, [userId]);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;

    setProfileSnapshot((previous) => ({
      userId,
      profile: previous?.userId === userId ? previous.profile : null,
      error: null,
      status: 'loading',
    }));

    try {
      const next = await loadProfile(userId);
      setProfileSnapshot({
        userId,
        profile: next,
        error: next ? null : PROFILE_NOT_FOUND,
        status: 'ready',
      });
    } catch (error) {
      setProfileSnapshot((previous) => ({
        userId,
        profile: previous?.userId === userId ? previous.profile : null,
        error: translateProfileError(error),
        status: 'ready',
      }));
    }
  }, [userId, loadProfile]);

  const updateFullName = useCallback(
    async (fullName: string) => {
      if (!userId) throw new Error('Tu sesión ya no es válida. Vuelve a iniciar sesión.');

      const name = fullName.trim();
      if (name.length < 1 || name.length > 120) {
        throw new Error('Escribe un nombre de entre 1 y 120 caracteres.');
      }

      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: name })
        .eq('id', userId)
        .select('id, full_name, timezone')
        .single();

      if (error) throw new Error(translateProfileError(error));

      const next = toProfile(data);
      if (next) {
        setProfileSnapshot({ userId, profile: next, error: null, status: 'ready' });
      }
    },
    [userId]
  );

  const updateTimezone = useCallback(
    async (timezone: string) => {
      const next = timezone.trim();
      if (next.length === 0) {
        throw new Error('Escribe una zona horaria IANA, por ejemplo America/Mexico_City.');
      }

      // profiles.timezone no es editable directamente: la RPC valida, actualiza
      // y resincroniza las tomas pendientes en una sola operación.
      const { error } = await supabase.rpc('resync_pending_timezone', { p_timezone: next });
      if (error) throw new Error(translateProfileError(error));

      await refreshProfile();
    },
    [refreshProfile]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isInitializing,
      isProfileLoading,
      profileError,
      signIn,
      signUp,
      signOut,
      updateFullName,
      updateTimezone,
      refreshProfile,
    }),
    [
      session,
      profile,
      isInitializing,
      isProfileLoading,
      profileError,
      signIn,
      signUp,
      signOut,
      updateFullName,
      updateTimezone,
      refreshProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  }
  return context;
}
