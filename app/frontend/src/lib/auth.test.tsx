import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type AuthClient, AuthProvider, useAuth } from './auth';

type Listener = Parameters<AuthClient['onAuthStateChange']>[0];

function fakeClient() {
  let listener: Listener | undefined;
  const unsubscribe = vi.fn();
  const client = {
    onAuthStateChange: vi.fn((cb: Listener) => {
      listener = cb;
      return { data: { subscription: { unsubscribe } } };
    }),
    signInWithOAuth: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
  };
  const emit = (session: { access_token: string } | null) =>
    act(() => listener?.(session ? 'SIGNED_IN' : 'SIGNED_OUT', session as never));
  return { client: client as unknown as AuthClient, raw: client, emit, unsubscribe };
}

function Probe() {
  const auth = useAuth();
  return (
    <>
      <p>{auth.status === 'signedIn' ? `signed in with ${auth.token}` : auth.status}</p>
      <button type="button" onClick={() => auth.signIn('github')}>
        sign in with github
      </button>
      <button type="button" onClick={() => auth.signIn('google')}>
        sign in with google
      </button>
      <button type="button" onClick={auth.signOut}>
        sign out
      </button>
    </>
  );
}

describe('AuthProvider', () => {
  it('is loading until Supabase reports the session', async () => {
    const { client, emit } = fakeClient();
    render(
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('loading')).toBeInTheDocument();

    await emit({ access_token: 'tok-1' });
    expect(screen.getByText('signed in with tok-1')).toBeInTheDocument();

    await emit(null);
    expect(screen.getByText('signedOut')).toBeInTheDocument();
  });

  it("forgets the signed-out User's data when the session ends", async () => {
    const { client, emit } = fakeClient();
    const onSignedOut = vi.fn();
    render(
      <AuthProvider client={client} onSignedOut={onSignedOut}>
        <Probe />
      </AuthProvider>,
    );

    await emit({ access_token: 'tok-1' });
    expect(onSignedOut).not.toHaveBeenCalled();

    await emit(null);
    expect(onSignedOut).toHaveBeenCalledTimes(1);
  });

  it.each(['github', 'google'])('signs in with %s and returns to /projects', (provider) => {
    const { client, raw } = fakeClient();
    render(
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>,
    );

    act(() => screen.getByRole('button', { name: `sign in with ${provider}` }).click());

    expect(raw.signInWithOAuth).toHaveBeenCalledWith({
      provider,
      options: { redirectTo: `${window.location.origin}/projects` },
    });
  });

  it('signs out', () => {
    const { client, raw } = fakeClient();
    render(
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>,
    );

    act(() => screen.getByRole('button', { name: 'sign out' }).click());

    expect(raw.signOut).toHaveBeenCalled();
  });

  it('stops listening on unmount', () => {
    const { client, unsubscribe } = fakeClient();
    const { unmount } = render(
      <AuthProvider client={client}>
        <Probe />
      </AuthProvider>,
    );

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
