import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
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

type Reply = unknown | { status: number; body?: unknown };
type Route = Reply | ((init: RequestInit & { json?: unknown }) => Reply | Promise<Reply>);

/**
 * A `fetch` stub that routes on `"METHOD /path"` (path relative to VITE_API_URL). A route is a JSON
 * body, `{ status, body }`, a Response, or a function of the request. Unmatched requests fail the test loudly.
 */
export function mockApi(routes: Record<string, Route>) {
  return async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? 'GET'} ${url.replace('http://api.test', '')}`;
    if (!(key in routes)) throw new Error(`unexpected request: ${key}`);
    const route = routes[key];
    const json = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    const reply = await (typeof route === 'function' ? route({ ...init, json }) : route);
    if (reply instanceof Response) return reply;
    const { status, body } =
      reply !== null && typeof reply === 'object' && 'status' in reply
        ? (reply as { status: number; body?: unknown })
        : { status: 200, body: reply };
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  };
}

/** A `text/event-stream` response with the given events, as the reply endpoint sends them. */
export function sseResponse(...events: [event: string, data: unknown][]) {
  const body = events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}

/** Renders the current router path, so tests can assert on navigation. */
export function LocationProbe() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}
