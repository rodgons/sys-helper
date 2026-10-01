import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../lib/auth';

export const signedOut = (): AuthContextValue => ({
  status: 'signedOut',
  signIn: vi.fn(),
  signOut: vi.fn(),
});

export const signedIn = (token = 'test-token'): AuthContextValue => ({
  status: 'signedIn',
  token,
  signIn: vi.fn(),
  signOut: vi.fn(),
});

/**
 * Renders UI inside a fresh, retry-less QueryClient so tests stay isolated and fast, inside a
 * MemoryRouter starting at `route` (default `/`) and with a fixed auth state (default signed out).
 */
export function renderWithQuery(
  ui: ReactNode,
  { route = '/', auth = signedOut() }: { route?: string; auth?: AuthContextValue } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

export function mockFetchJson(body: unknown, status = 200) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}
