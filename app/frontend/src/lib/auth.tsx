import type { SupabaseClient } from '@supabase/supabase-js';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

/** The slice of the Supabase Auth client the app uses; tests pass a fake. */
export type AuthClient = Pick<
  SupabaseClient['auth'],
  'onAuthStateChange' | 'signInWithOAuth' | 'signOut'
>;

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; token: string };

export type AuthContextValue = AuthState & { signIn: () => void; signOut: () => void };

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Tracks the Supabase session. Users sign in with GitHub only and land on /projects. */
export function AuthProvider({ client, children }: { client: AuthClient; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    // Fires INITIAL_SESSION right away, then on every sign-in, sign-out and token refresh.
    const { data } = client.onAuthStateChange((_event, session) => {
      setState(
        session ? { status: 'signedIn', token: session.access_token } : { status: 'signedOut' },
      );
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn: () => {
        void client.signInWithOAuth({
          provider: 'github',
          options: { redirectTo: `${window.location.origin}/projects` },
        });
      },
      signOut: () => {
        void client.signOut();
      },
    }),
    [client, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}
