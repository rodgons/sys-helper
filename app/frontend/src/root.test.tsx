import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Root } from './root';
import { mockFetchJson, renderWithQuery } from './test/render';

describe('Root', () => {
  it('renders the UI kit page at /ui-kit', () => {
    renderWithQuery(<Root />, { route: '/ui-kit' });

    expect(screen.getByRole('heading', { level: 1, name: /ui kit/i })).toBeInTheDocument();
  });

  it('renders the app at any other path', async () => {
    vi.stubGlobal('fetch', vi.fn(mockFetchJson({ status: 'ok', database: 'up' })));

    renderWithQuery(<Root />, { route: '/' });

    expect(await screen.findByText('API: ok · database: up')).toBeInTheDocument();
  });

  it('ignores a trailing slash', () => {
    renderWithQuery(<Root />, { route: '/ui-kit/' });

    expect(screen.getByRole('heading', { level: 1, name: /ui kit/i })).toBeInTheDocument();
  });

  it('marks the current page in the main nav', () => {
    renderWithQuery(<Root />, { route: '/ui-kit' });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('UI kit');
  });
});
