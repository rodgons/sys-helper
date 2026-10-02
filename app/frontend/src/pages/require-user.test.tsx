import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../lib/auth';
import { mockApi, renderWithQuery, signedIn } from '../test/render';
import { RequireUser } from './require-user';

afterEach(() => vi.unstubAllGlobals());

function Draft() {
  const [text, setText] = useState('');
  return <input aria-label="draft" value={text} onChange={(e) => setText(e.target.value)} />;
}

describe('RequireUser', () => {
  it('keeps its children mounted when the access token refreshes', async () => {
    let release: () => void = () => {};
    const refreshed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetch = vi.fn(
      mockApi({
        'GET /api/me': async (init: RequestInit) => {
          if ((init.headers as Record<string, string>).Authorization === 'Bearer tok-2') {
            await refreshed;
          }
          return { displayName: 'ada', avatarUrl: '' };
        },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (token: string) => (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={signedIn(token)}>
          <MemoryRouter>
            <RequireUser>{(me) => <Draft key={me.displayName} />}</RequireUser>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );

    const { rerender } = render(ui('tok-1'));
    fireEvent.change(await screen.findByLabelText('draft'), { target: { value: 'half-written' } });

    rerender(ui('tok-2'));
    expect(screen.getByLabelText('draft')).toHaveValue('half-written');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    release();
    await vi.waitFor(() => expect(screen.getByLabelText('draft')).toHaveValue('half-written'));
  });

  it('asks Users without a supported identity to sign in with GitHub or Google', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(mockApi({ 'GET /api/me': { status: 403, body: { error: 'identity_required' } } })),
    );
    const auth = signedIn();
    renderWithQuery(<RequireUser>{() => 'secret'}</RequireUser>, { auth });

    expect(
      await screen.findByRole('heading', { name: 'Sign in with GitHub or Google to continue' }),
    ).toBeVisible();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.signOut).toHaveBeenCalled();
  });

  const notAllowed = (identities: { provider: string; id: string; name: string }[]) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(
        mockApi({ 'GET /api/me': { status: 403, body: { error: 'not_allowed', identities } } }),
      ),
    );

  it('asks GitHub Users for access with their username', async () => {
    notAllowed([{ provider: 'github', id: '583231', name: 'octocat' }]);
    renderWithQuery(<RequireUser>{() => 'secret'}</RequireUser>, { auth: signedIn() });

    expect(
      await screen.findByRole('heading', { name: "You're not on the beta list yet" }),
    ).toBeVisible();
    expect(screen.getByText(/ask for access with your GitHub username/i)).toBeVisible();
    expect(screen.getByText('octocat')).toBeVisible();
    expect(screen.queryByText(/Google id/i)).not.toBeInTheDocument();
  });

  it('shows Google Users their Google id to copy', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    notAllowed([{ provider: 'google', id: '108378921029384756123', name: 'Ada Lovelace' }]);
    renderWithQuery(<RequireUser>{() => 'secret'}</RequireUser>, { auth: signedIn() });

    expect(await screen.findByText('108378921029384756123')).toBeVisible();
    expect(screen.queryByText(/GitHub username/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy Google id' }));
    expect(writeText).toHaveBeenCalledWith('108378921029384756123');
  });

  it('shows a linked User both ways to ask', async () => {
    notAllowed([
      { provider: 'github', id: '583231', name: 'octocat' },
      { provider: 'google', id: '108', name: 'Ada Lovelace' },
    ]);
    renderWithQuery(<RequireUser>{() => 'secret'}</RequireUser>, { auth: signedIn() });

    expect(await screen.findByText('octocat')).toBeVisible();
    expect(screen.getByText('108')).toBeVisible();
  });
});
