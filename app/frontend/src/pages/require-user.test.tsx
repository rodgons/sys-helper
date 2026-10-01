import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../lib/auth';
import { mockApi, signedIn } from '../test/render';
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
          return { username: 'ada', avatarUrl: '' };
        },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (token: string) => (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={signedIn(token)}>
          <MemoryRouter>
            <RequireUser>{(me) => <Draft key={me.username} />}</RequireUser>
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
});
