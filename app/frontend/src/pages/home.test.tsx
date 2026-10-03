import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setThemeChoice } from '../lib/theme';
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

  it('shows the screenshot in the chosen scheme, or the system one', () => {
    const { unmount } = renderWithQuery(<Root />, { route: '/' });
    const preview = () => screen.getByRole('region', { name: /side by side/i });
    expect(preview().querySelector('source')).toHaveAttribute(
      'media',
      '(prefers-color-scheme: dark)',
    );
    unmount();

    setThemeChoice('dark');
    renderWithQuery(<Root />, { route: '/' });

    expect(preview().querySelector('source')).not.toBeInTheDocument();
    expect(
      within(preview())
        .getByRole('img', { name: /workspace/i })
        .getAttribute('src'),
    ).toMatch(/workspace-dark/);
    setThemeChoice('system');
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
