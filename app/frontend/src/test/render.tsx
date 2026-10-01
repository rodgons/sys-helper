import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';

/**
 * Renders UI inside a fresh, retry-less QueryClient so tests stay isolated and fast, and inside a
 * MemoryRouter starting at `route` (default `/`).
 */
export function renderWithQuery(ui: ReactNode, { route = '/' }: { route?: string } = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

export function mockFetchJson(body: unknown, status = 200) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}
