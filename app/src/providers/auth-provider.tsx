/**
 * Signs the user in anonymously on first launch and exposes the session to the app.
 *
 * Auth never blocks the UI: if the phone is offline (MTR, mall basement) the app still opens and
 * recording still works; sign-in is retried with `retry()` or on the next launch.
 */
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type AuthState =
  | { status: 'loading' }
  | { status: 'signed-in'; session: Session }
  | { status: 'error'; message: string };

type AuthContextValue = AuthState & { retry: () => void };

const AuthContext = createContext<AuthContextValue | null>(null);

const NOT_CONFIGURED: AuthState = {
  status: 'error',
  message: 'Supabase is not configured — see docs/SETUP.md.',
};

/** Re-uses the saved session, or creates an anonymous account on first launch. */
async function loadOrCreateSession(): Promise<AuthState> {
  // 1. Saved session → same anonymous user across app restarts.
  const { data, error } = await supabase.auth.getSession();
  if (error) return { status: 'error', message: error.message };
  if (data.session) return { status: 'signed-in', session: data.session };

  // 2. First launch: anonymous account. A profile row is created by a database trigger.
  const anon = await supabase.auth.signInAnonymously();
  if (anon.error || !anon.data.session) {
    return { status: 'error', message: anon.error?.message ?? 'Sign-in failed' };
  }
  return { status: 'signed-in', session: anon.data.session };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(
    isSupabaseConfigured ? { status: 'loading' } : NOT_CONFIGURED,
  );

  // "Try again" button: show the spinner, then sign in again.
  const retry = useCallback(() => {
    if (!isSupabaseConfigured) return;
    setState({ status: 'loading' });
    void loadOrCreateSession().then(setState);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    void loadOrCreateSession().then((next) => {
      if (mounted) setState(next);
    });

    // Keep state in sync when the token refreshes or the user upgrades to an email account.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setState({ status: 'signed-in', session });
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={{ ...state, retry }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
