import { QueryClient, QueryClientProvider } from '@tanstack/preact-query';
import { render } from '@testing-library/preact';
import type { ComponentChild } from 'preact';

/** Renders UI inside a fresh, retry-less QueryClient so tests stay isolated and fast. */
export function renderWithQuery(ui: ComponentChild) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

export function mockFetchJson(body: unknown, status = 200) {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}
