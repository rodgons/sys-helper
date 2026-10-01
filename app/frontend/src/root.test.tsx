import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Root } from './root';
import { renderWithQuery, signedIn } from './test/render';

describe('Root', () => {
  it('renders the UI kit page at /ui-kit', () => {
    renderWithQuery(<Root />, { route: '/ui-kit' });

    expect(screen.getByRole('heading', { level: 1, name: /ui kit/i })).toBeInTheDocument();
  });

  it('renders the home page at /', () => {
    renderWithQuery(<Root />, { route: '/' });

    expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument();
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

  it('offers sign-in when signed out and sign-out when signed in', () => {
    const { unmount } = renderWithQuery(<Root />, { route: '/ui-kit' });
    expect(screen.getByRole('banner')).toHaveTextContent(/sign in/i);
    unmount();

    renderWithQuery(<Root />, { route: '/ui-kit', auth: signedIn() });
    expect(screen.getByRole('banner')).toHaveTextContent(/sign out/i);
  });
});
