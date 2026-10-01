import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Root } from '../root';
import { mockApi, renderWithQuery, signedIn, signedOut } from '../test/render';

describe('Home page', () => {
  it('explains the product and offers GitHub sign-in', () => {
    const auth = signedOut();
    renderWithQuery(<Root />, { route: '/', auth });

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/architecture/i);
    expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /sign in with github/i, hidden: false }));

    expect(auth.signIn).toHaveBeenCalled();
  });

  it('sends signed-in users to their projects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        mockApi({ 'GET /api/me': { username: 'octocat', avatarUrl: '' }, 'GET /api/projects': [] }),
      ),
    );

    renderWithQuery(<Root />, { route: '/', auth: signedIn() });

    expect(await screen.findByRole('heading', { name: /no projects yet/i })).toBeInTheDocument();
  });
});
