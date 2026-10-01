import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Root } from './root';
import { mockApi, renderWithQuery, signedIn } from './test/render';

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

  it('offers sign-in when signed out', () => {
    renderWithQuery(<Root />, { route: '/ui-kit' });

    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: /sign in/i }),
    ).toBeVisible();
  });

  it("shows the signed-in User's avatar, with sign-out in its menu", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        mockApi({
          'GET /api/me': { username: 'octocat', avatarUrl: 'https://example.test/o.png' },
        }),
      ),
    );
    const auth = signedIn();
    renderWithQuery(<Root />, { route: '/ui-kit', auth });
    const banner = within(screen.getByRole('banner'));
    expect(banner.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();

    expect(await banner.findByRole('img', { name: 'octocat' })).toHaveAttribute(
      'src',
      'https://example.test/o.png',
    );
    fireEvent.click(banner.getByRole('button', { name: 'Account' }));
    fireEvent.click(banner.getByRole('menuitem', { name: 'Sign out' }));

    expect(auth.signOut).toHaveBeenCalled();
  });

  it("falls back to the username's first letter without a photo", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(mockApi({ 'GET /api/me': { username: 'octocat', avatarUrl: '' } })),
    );
    renderWithQuery(<Root />, { route: '/ui-kit', auth: signedIn() });

    expect(
      await within(screen.getByRole('banner')).findByRole('img', { name: 'octocat' }),
    ).toHaveTextContent('O');
  });
});
