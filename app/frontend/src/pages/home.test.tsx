import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Root } from '../root';
import { LocationProbe, mockApi, renderWithQuery, signedIn, signedOut } from '../test/render';

describe('Home page', () => {
  it('explains the product and leads to the login page', () => {
    renderWithQuery(
      <>
        <Root />
        <LocationProbe />
      </>,
      { route: '/', auth: signedOut() },
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/architecture/i);
    expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /github|google/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('main').querySelector('a[href="/login"]') as HTMLElement);

    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('shows what the workspace looks like when signed in', () => {
    renderWithQuery(<Root />, { route: '/', auth: signedOut() });

    const preview = screen.getByRole('region', { name: /side by side/i });
    expect(within(preview).getByRole('img', { name: /workspace/i })).toBeInTheDocument();
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

    renderWithQuery(<Root />, { route: '/', auth: signedIn() });

    expect(await screen.findByRole('heading', { name: /no projects yet/i })).toBeInTheDocument();
  });
});
