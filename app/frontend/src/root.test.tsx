import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
    renderWithQuery(<Root />, { route: '/' });

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent('Home');
  });

  it('links to the home page only when signed out, and never to the UI kit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(mockApi({ 'GET /api/me': { username: 'octocat', avatarUrl: '' } })),
    );
    const { unmount } = renderWithQuery(<Root />, { route: '/' });
    const nav = within(screen.getByRole('navigation', { name: 'Main' }));
    expect(nav.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(nav.queryByRole('link', { name: 'UI kit' })).not.toBeInTheDocument();
    unmount();

    renderWithQuery(<Root />, { route: '/ui-kit', auth: signedIn() });

    await within(screen.getByRole('banner')).findByRole('img', { name: 'octocat' });
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
  });

  it('offers sign-in when signed out', () => {
    renderWithQuery(<Root />, { route: '/ui-kit' });

    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: /sign in/i }),
    ).toBeVisible();
  });

  it("shows the signed-in User's avatar, with their name and sign-out in its menu", async () => {
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
    expect(within(banner.getByRole('menu')).getByText('octocat')).toBeInTheDocument();
    fireEvent.click(banner.getByRole('menuitem', { name: 'Sign out' }));

    expect(auth.signOut).toHaveBeenCalled();
  });

  it('saves a default experience level from the settings dialog', async () => {
    const put = vi.fn(({ json }: { json?: unknown }) => json);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        mockApi({
          'GET /api/me': { username: 'octocat', avatarUrl: '' },
          'GET /api/settings': { experienceLevel: '' },
          'PUT /api/settings': put,
        }),
      ),
    );
    renderWithQuery(<Root />, { route: '/ui-kit', auth: signedIn() });
    const banner = within(screen.getByRole('banner'));

    fireEvent.click(await banner.findByRole('button', { name: 'Account' }));
    fireEvent.click(banner.getByRole('menuitem', { name: 'Settings' }));
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    const level = within(dialog).getByLabelText('Default experience level');
    await waitFor(() => expect(level).toHaveValue(''));
    fireEvent.change(level, { target: { value: 'expert' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0]?.[0].json).toEqual({ experienceLevel: 'expert' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
