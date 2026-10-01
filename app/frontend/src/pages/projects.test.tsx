import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Root } from '../root';
import { LocationProbe, mockApi, renderWithQuery, signedIn, signedOut } from '../test/render';

const me = { username: 'octocat', avatarUrl: '' };
const project = {
  slug: 'url-shortener-k3xa9q2m7p',
  name: 'URL Shortener',
  updatedAt: '2026-09-30T00:00:00Z',
};

function renderAt(route: string, auth = signedIn()) {
  return renderWithQuery(
    <>
      <Root />
      <LocationProbe />
    </>,
    { route, auth },
  );
}

describe('Projects page', () => {
  it('sends signed-out visitors to the home page', () => {
    renderAt('/projects', signedOut());

    expect(screen.getByRole('heading', { name: /how it works/i })).toBeInTheDocument();
  });

  it('shows the empty state and creates a first project', async () => {
    const create = vi.fn(() => ({ status: 201, body: project }));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        mockApi({
          'GET /api/me': me,
          'GET /api/projects': [],
          'POST /api/projects': create,
          'GET /api/projects/url-shortener-k3xa9q2m7p': project,
        }),
      ),
    );

    renderAt('/projects');

    expect(await screen.findByRole('heading', { name: /no projects yet/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'URL Shortener' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/p/url-shortener-k3xa9q2m7p'),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ json: { name: 'URL Shortener' } }),
    );
  });

  it('opens the most recent project when there is one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        mockApi({
          'GET /api/me': me,
          'GET /api/projects': [project],
          'GET /api/projects/url-shortener-k3xa9q2m7p': project,
        }),
      ),
    );

    renderAt('/projects');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/p/url-shortener-k3xa9q2m7p'),
    );
  });

  it('tells users outside the beta allowlist and lets them sign out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(mockApi({ 'GET /api/me': { status: 403, body: { error: 'not_allowed' } } })),
    );
    const auth = signedIn();

    renderAt('/projects', auth);

    expect(await screen.findByText(/not on the beta list/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('main').querySelector('button') as HTMLElement);
    expect(auth.signOut).toHaveBeenCalled();
  });
});
