import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Root } from '../root';
import { LocationProbe, mockApi, renderWithQuery, signedIn } from '../test/render';

const me = { username: 'octocat', avatarUrl: '' };
const shortener = {
  slug: 'url-shortener-k3xa9q2m7p',
  name: 'URL Shortener',
  updatedAt: '2026-09-30T00:00:00Z',
};
const emptyArchitecture = { version: 0, document: { components: [], connections: [] } };
const chat = { slug: 'chat-app-a1b2c3d4e5', name: 'Chat App', updatedAt: '2026-09-29T00:00:00Z' };

function renderAt(route: string) {
  return renderWithQuery(
    <>
      <Root />
      <LocationProbe />
    </>,
    { route, auth: signedIn() },
  );
}

function stubApi(extra: Parameters<typeof mockApi>[0] = {}) {
  const fetch = vi.fn(
    mockApi({
      'GET /api/me': me,
      'GET /api/projects': [shortener, chat],
      'GET /api/projects/url-shortener-k3xa9q2m7p': shortener,
      'GET /api/projects/chat-app-a1b2c3d4e5': chat,
      'GET /api/projects/url-shortener-k3xa9q2m7p/architecture': emptyArchitecture,
      'GET /api/projects/chat-app-a1b2c3d4e5/architecture': emptyArchitecture,
      'GET /api/projects/url-shortener-k3xa9q2m7p/messages': [],
      'GET /api/projects/chat-app-a1b2c3d4e5/messages': [],
      ...extra,
    }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('Workspace', () => {
  it('shows the project list, the canvas and the conversation', async () => {
    stubApi();

    renderAt('/p/url-shortener-k3xa9q2m7p');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'URL Shortener' }),
    ).toBeInTheDocument();
    const list = screen.getByRole('navigation', { name: 'Projects' });
    expect(await within(list).findByRole('link', { name: 'Chat App' })).toHaveAttribute(
      'href',
      '/p/chat-app-a1b2c3d4e5',
    );
    expect(within(list).getByRole('link', { name: 'URL Shortener' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('region', { name: 'Canvas' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Conversation' })).toBeInTheDocument();
  });

  it('redirects an outdated slug to the canonical one', async () => {
    stubApi({ 'GET /api/projects/old-name-k3xa9q2m7p': shortener });

    renderAt('/p/old-name-k3xa9q2m7p');

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/p/url-shortener-k3xa9q2m7p'),
    );
  });

  it('says when a project does not exist', async () => {
    stubApi({ 'GET /api/projects/gone-zzzzzzzzzz': { status: 404, body: { error: 'not_found' } } });

    renderAt('/p/gone-zzzzzzzzzz');

    expect(await screen.findByRole('heading', { name: 'Project not found' })).toBeInTheDocument();
  });

  it('collapses and expands the project list', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    const toggle = await screen.findByRole('button', { name: 'Hide projects' });

    fireEvent.click(toggle);

    expect(screen.queryByRole('navigation', { name: 'Projects' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show projects' }));
    expect(screen.getByRole('navigation', { name: 'Projects' })).toBeInTheDocument();
  });

  it('creates another project from the sidebar', async () => {
    const created = {
      slug: 'search-q1w2e3r4t5',
      name: 'Search',
      updatedAt: '2026-09-30T01:00:00Z',
    };
    stubApi({
      'POST /api/projects': { status: 201, body: created },
      'GET /api/projects/search-q1w2e3r4t5': created,
    });
    renderAt('/p/url-shortener-k3xa9q2m7p');

    fireEvent.click(await screen.findByRole('button', { name: 'New project' }));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Search' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/p/search-q1w2e3r4t5'),
    );
  });

  it('renames the project and follows the new slug', async () => {
    const renamed = { ...shortener, slug: 'link-service-k3xa9q2m7p', name: 'Link Service' };
    const rename = vi.fn(() => renamed);
    stubApi({
      'PATCH /api/projects/url-shortener-k3xa9q2m7p': rename,
      'GET /api/projects/link-service-k3xa9q2m7p': renamed,
    });
    renderAt('/p/url-shortener-k3xa9q2m7p');

    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Link Service' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/p/link-service-k3xa9q2m7p'),
    );
    expect(rename).toHaveBeenCalledWith(
      expect.objectContaining({ json: { name: 'Link Service' } }),
    );
  });

  it('deletes the project only after confirmation', async () => {
    let list = [shortener, chat];
    const remove = vi.fn(() => {
      list = [chat];
      return { status: 204 };
    });
    stubApi({
      'GET /api/projects': () => list,
      'DELETE /api/projects/url-shortener-k3xa9q2m7p': remove,
    });
    renderAt('/p/url-shortener-k3xa9q2m7p');

    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/delete “URL Shortener”/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));

    await waitFor(() => expect(remove).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('location')).not.toHaveTextContent('url-shortener'),
    );
  });

  it('tells small screens the workspace is built for desktop', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');

    expect(await screen.findByText(/best on a screen at least 1024px wide/i)).toBeInTheDocument();
  });
});
