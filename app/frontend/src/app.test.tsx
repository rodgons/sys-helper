import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { mockFetchJson, renderWithQuery } from './test/render';

describe('App', () => {
  it('shows API readiness from the backend', async () => {
    const fetch = vi.fn(mockFetchJson({ status: 'ok', database: 'up' }));
    vi.stubGlobal('fetch', fetch);

    renderWithQuery(<App />);

    expect(await screen.findByText('API: ok · database: up')).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('http://api.test/ready', undefined);
  });

  it('shows unavailable when the backend fails', async () => {
    vi.stubGlobal('fetch', vi.fn(mockFetchJson({ status: 'unavailable' }, 503)));

    renderWithQuery(<App />);

    expect(await screen.findByText('API: unavailable')).toBeInTheDocument();
  });
});
