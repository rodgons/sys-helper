import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/** The slice of the Supabase Auth client the app uses; tests pass a fake. */
export type AuthClient = Pick<
  SupabaseClient['auth'],
  'onAuthStateChange' | 'signInWithOAuth' | 'signOut'
>;

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; token: string };

/** The sign-in providers a User can use. Both reach the same User when their verified emails match. */
export type Provider = 'github' | 'google';

export type AuthContextValue = AuthState & {
  signIn: (provider: Provider) => void;
  signOut: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Tracks the Supabase session. Users sign in with GitHub or Google and land on /projects.
 * `onSignedOut` runs when a session ends (here or in another tab), so the app can drop the User's
 * cached data before anyone else signs in.
 */
export function AuthProvider({
  client,
  onSignedOut,
  children,
}: {
  client: AuthClient;
  onSignedOut?: () => void;
  children: ReactNode;
}) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const signedOut = useRef(onSignedOut);
  signedOut.current = onSignedOut;

  useEffect(() => {
    let hadSession = false;
    // Fires INITIAL_SESSION right away, then on every sign-in, sign-out and token refresh.
    const { data } = client.onAuthStateChange((_event, session) => {
      if (!session && hadSession) signedOut.current?.();
      hadSession = Boolean(session);
      setState(
        session ? { status: 'signedIn', token: session.access_token } : { status: 'signedOut' },
      );
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn: (provider) => {
        void client.signInWithOAuth({
          provider,
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

/** The signed-in User's access token, or undefined while loading or signed out. */
export function useToken(): string | undefined {
  const auth = useAuth();
  return auth.status === 'signedIn' ? auth.token : undefined;
}
