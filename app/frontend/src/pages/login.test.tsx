import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Root } from '../root';
import { LocationProbe, mockApi, renderWithQuery, signedIn, signedOut } from '../test/render';

afterEach(() => vi.unstubAllGlobals());

describe('Login page', () => {
  it('offers GitHub and Google sign-in', () => {
    const auth = signedOut();
    renderWithQuery(<Root />, { route: '/login', auth });

    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to sys-helper' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }));
    expect(auth.signIn).toHaveBeenLastCalledWith('github');

    fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(auth.signIn).toHaveBeenLastCalledWith('google');
  });

  it('says before sign-in that conversations go to third-party AI models', () => {
    renderWithQuery(<Root />, { route: '/login', auth: signedOut() });

    expect(screen.getByText(/third-party AI models/i)).toBeVisible();
    expect(screen.getByText(/may log/i)).toBeVisible();
  });

  it('marks each option with its provider icon, hidden from screen readers', () => {
    renderWithQuery(<Root />, { route: '/login', auth: signedOut() });

    for (const name of ['Continue with GitHub', 'Continue with Google']) {
      const icon = screen.getByRole('button', { name }).querySelector('svg');
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('hides the header sign-in, since the page is the sign-in', () => {
    renderWithQuery(<Root />, { route: '/login', auth: signedOut() });

    expect(
      within(screen.getByRole('banner')).queryByRole('link', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });

  it('sends signed-in users to their projects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        mockApi({
          'GET /api/me': { displayName: 'octocat', avatarUrl: '' },
          'GET /api/projects': [],
        }),
      ),
    );
    renderWithQuery(
      <>
        <Root />
        <LocationProbe />
      </>,
      { route: '/login', auth: signedIn() },
    );

    expect(await screen.findByTestId('location')).toHaveTextContent('/projects');
  });
});
