import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Root } from '../root';
import { mockFetchJson, renderWithQuery, signedIn, signedOut } from '../test/render';

describe('Projects page', () => {
  it('sends signed-out visitors to the home page', () => {
    renderWithQuery(<Root />, { route: '/projects', auth: signedOut() });

    expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument();
  });

  it('shows the empty state for a signed-in user', async () => {
    const fetch = vi.fn(mockFetchJson({ username: 'octocat', avatarUrl: '' }));
    vi.stubGlobal('fetch', fetch);

    renderWithQuery(<Root />, { route: '/projects', auth: signedIn('tok-1') });

    expect(await screen.findByRole('heading', { name: /no projects yet/i })).toBeInTheDocument();
    expect(screen.getByText(/octocat/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      'http://api.test/api/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer tok-1' }),
      }),
    );
  });

  it('tells users outside the beta allowlist and lets them sign out', async () => {
    vi.stubGlobal('fetch', vi.fn(mockFetchJson({ error: 'not_allowed' }, 403)));
    const auth = signedIn();

    renderWithQuery(<Root />, { route: '/projects', auth });

    expect(await screen.findByText(/not on the beta list/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /sign out/i })[0] as HTMLElement);
    expect(auth.signOut).toHaveBeenCalled();
  });
});
