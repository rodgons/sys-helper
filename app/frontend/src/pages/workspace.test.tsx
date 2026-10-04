import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Root } from '../root';
import {
  LocationProbe,
  mockApi,
  renderWithQuery,
  setCompact,
  signedIn,
  sseResponse,
} from '../test/render';

const me = { displayName: 'octocat', avatarUrl: '' };
const shortener = {
  slug: 'url-shortener-k3xa9q2m7p',
  name: 'URL Shortener',
  updatedAt: '2026-09-30T00:00:00Z',
};
const noKnowledge = { experienceLevel: '', requirements: [], decisions: [] };
const emptyArchitecture = { version: 0, document: { components: [], connections: [] } };
const chat = { slug: 'chat-app-a1b2c3d4e5', name: 'Chat App', updatedAt: '2026-09-29T00:00:00Z' };

/** A button that navigates within the app, as a link elsewhere on the page would. */
function GoTo({ path }: { path: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(path)}>
      Go
    </button>
  );
}

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
      'GET /api/projects/url-shortener-k3xa9q2m7p/knowledge': noKnowledge,
      'GET /api/projects/chat-app-a1b2c3d4e5/knowledge': noKnowledge,
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
    expect(screen.getByRole('tab', { name: 'Conversation', selected: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Requirements/ })).toBeInTheDocument();
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

    expect(screen.queryByText('Projects')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show projects' }));
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('collapses and expands the chat, keeping the draft message', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Half-typed' } });

    fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }));

    expect(screen.queryByRole('tab', { name: 'Conversation' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show chat' }));
    expect(screen.getByRole('tab', { name: 'Conversation', selected: true })).toBeVisible();
    expect(screen.getByLabelText('Message')).toHaveValue('Half-typed');
  });

  it('shows each project as a letter on the collapsed rail', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    fireEvent.click(await screen.findByRole('button', { name: 'Hide projects' }));

    const rail = screen.getByRole('navigation', { name: 'Projects' });
    const current = within(rail).getByRole('link', { name: 'URL Shortener' });
    expect(current).toHaveTextContent('U');
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(within(rail).getByRole('link', { name: 'Chat App' })).toHaveAttribute(
      'href',
      '/p/chat-app-a1b2c3d4e5',
    );
  });

  it('opens the new project dialog from the rail', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    fireEvent.click(await screen.findByRole('button', { name: 'Hide projects' }));

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));

    const dialog = screen.getByRole('dialog', { name: 'New project' });
    expect(within(dialog).getByLabelText('Project name')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Show projects' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('creates another project from a dialog', async () => {
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
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    fireEvent.change(within(dialog).getByLabelText('Project name'), {
      target: { value: 'Search' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/p/search-q1w2e3r4t5'),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

  it('deletes the project only after confirming in a dialog, then says so', async () => {
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
    const dialog = screen.getByRole('dialog', { name: /delete “URL Shortener”/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete project' }),
    );

    await waitFor(() => expect(remove).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('location')).not.toHaveTextContent('url-shortener'),
    );
    expect(await screen.findByText('“URL Shortener” was deleted.')).toBeInTheDocument();
  });

  it('drops the pending proposal from the canvas when a new conversation starts', async () => {
    const at = '2026-09-30T00:00:00Z';
    const welcome = { role: 'assistant', body: 'What are you building?', createdAt: at };
    const proposal = {
      seq: 1,
      summary: 'Add a cache',
      status: 'pending',
      baseVersion: 0,
      changes: [{ op: 'add_component', ref: 'cache', type: 'cache', name: 'Order Cache' }],
    };
    stubApi({
      'GET /api/projects/url-shortener-k3xa9q2m7p/messages': [
        welcome,
        { role: 'assistant', body: 'Here is a cache.', createdAt: at, proposal },
      ],
      'POST /api/projects/url-shortener-k3xa9q2m7p/conversation': [welcome],
    });
    renderAt('/p/url-shortener-k3xa9q2m7p');
    expect(await screen.findByRole('region', { name: 'Proposal' })).toBeInTheDocument();
    expect(screen.getByText('Order Cache')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New conversation' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Start a new conversation?' })).getByRole(
        'button',
        { name: 'Start new conversation' },
      ),
    );

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Proposal' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Order Cache')).not.toBeInTheDocument();
    expect(screen.queryByText('Here is a cache.')).not.toBeInTheDocument();
  });
});

describe('Workspace on compact screens', () => {
  const at = '2026-09-30T00:00:00Z';
  const proposal = {
    seq: 1,
    summary: 'Add a cache',
    status: 'pending',
    baseVersion: 0,
    changes: [{ op: 'add_component', ref: 'cache', type: 'cache', name: 'Order Cache' }],
  };
  const handle = () => screen.getByRole('separator', { name: 'Resize panel' });
  const snap = () => handle().getAttribute('aria-valuetext');

  it('docks the side panel under the canvas, with no project list, resizer or notice', async () => {
    setCompact(true);
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');

    expect(await screen.findByRole('tab', { name: 'Conversation', selected: true })).toBeVisible();
    expect(screen.getByRole('region', { name: 'Canvas' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Projects' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hide (projects|chat)/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/best on a screen/i)).not.toBeInTheDocument();
    expect(handle()).toHaveAttribute('aria-orientation', 'horizontal');
    expect(screen.getAllByRole('tablist')).toHaveLength(1);
  });

  it('shows the counts, the Needs Review dot and the pending-Proposal dot on its tabs', async () => {
    setCompact(true);
    stubApi({
      'GET /api/projects/url-shortener-k3xa9q2m7p/knowledge': {
        experienceLevel: '',
        requirements: [{ id: 'R1', category: 'scale', statement: '10k redirects per second' }],
        decisions: [
          {
            id: 'D1',
            title: 'Cache redirects',
            rationale: 'Reads dominate.',
            pattern: '',
            alternative: '',
            requirements: [],
            targets: [],
            author: 'ai',
            needsReview: true,
          },
        ],
      },
      'GET /api/projects/url-shortener-k3xa9q2m7p/messages': [
        { role: 'assistant', body: 'Here is a cache.', createdAt: at, proposal },
      ],
    });
    renderAt('/p/url-shortener-k3xa9q2m7p');

    expect(await screen.findByRole('tab', { name: /Requirements 1/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Decisions 1 1 need review/ })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: /Conversation Proposal to review/ }),
    ).toBeInTheDocument();
  });

  it('opens at half, toggles peek and half from the handle, and opens half from a tab', async () => {
    setCompact(true);
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Half-typed' } });
    expect(snap()).toBe('Half');

    fireEvent.click(handle());
    expect(snap()).toBe('Peek');
    fireEvent.click(handle());
    expect(snap()).toBe('Half');
    fireEvent.keyDown(handle(), { key: 'Home' });
    fireEvent.click(screen.getByRole('tab', { name: /Requirements/ }));

    expect(snap()).toBe('Half');
    expect(screen.getByRole('tab', { name: /Requirements/, selected: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Conversation' }));
    expect(screen.getByLabelText('Message')).toHaveValue('Half-typed');
  });

  it('opens at half on every Project open', async () => {
    setCompact(true);
    stubApi();
    renderWithQuery(
      <>
        <Root />
        <GoTo path="/p/chat-app-a1b2c3d4e5" />
      </>,
      { route: '/p/url-shortener-k3xa9q2m7p', auth: signedIn() },
    );
    await screen.findByLabelText('Message');
    fireEvent.keyDown(handle(), { key: 'End' });
    expect(snap()).toBe('Full');

    fireEvent.click(screen.getByRole('button', { name: 'Go' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Chat App' })).toBeInTheDocument();
    expect(snap()).toBe('Half');
  });

  it('drops from full to half when a Proposal arrives', async () => {
    setCompact(true);
    stubApi({
      'POST /api/projects/url-shortener-k3xa9q2m7p/messages': ({ json }: { json?: unknown }) => ({
        status: 201,
        body: { role: 'user', body: (json as { body: string }).body, createdAt: at },
      }),
      'POST /api/projects/url-shortener-k3xa9q2m7p/reply': () =>
        sseResponse(['done', { role: 'assistant', body: 'A cache.', createdAt: at, proposal }]),
    });
    renderAt('/p/url-shortener-k3xa9q2m7p');
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Speed it up' } });
    fireEvent.keyDown(handle(), { key: 'End' });
    expect(snap()).toBe('Full');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('region', { name: 'Proposal' })).toBeInTheDocument();
    expect(snap()).toBe('Half');
  });

  it('swaps the site header for a workspace bar, only in the workspace', async () => {
    setCompact(true);
    stubApi();
    const { unmount } = renderAt('/p/url-shortener-k3xa9q2m7p');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'URL Shortener' }),
    ).toBeInTheDocument();
    // One banner: the workspace bar, without the site header's brand link.
    const bar = within(screen.getByRole('banner'));
    expect(bar.queryByRole('link', { name: /helper/ })).not.toBeInTheDocument();
    expect(bar.getByRole('heading', { level: 1, name: 'URL Shortener' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Projects' })).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Project actions' })).toBeInTheDocument();
    expect(await bar.findByRole('img', { name: 'octocat' })).toBeInTheDocument();
    unmount();

    renderAt('/projects');
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: /helper/ }),
    ).toBeInTheDocument();
  });

  it('opens the Projects drawer from ☰ and switches Projects from it', async () => {
    setCompact(true);
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    fireEvent.click(await screen.findByRole('button', { name: 'Projects' }));

    const drawer = screen.getByRole('dialog', { name: 'Projects' });
    expect(await within(drawer).findByRole('link', { name: 'URL Shortener' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(drawer).getByRole('link', { name: 'sys-helper' })).toHaveAttribute('href', '/');
    expect(within(drawer).getByRole('button', { name: 'Theme' })).toBeInTheDocument();
    fireEvent.click(within(drawer).getByRole('link', { name: 'Chat App' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/p/chat-app-a1b2c3d4e5'),
    );
    expect(screen.queryByRole('dialog', { name: 'Projects' })).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Chat App' })).toBeInTheDocument();
  });

  it('closes the drawer with ✕, Esc, a swipe left or picking the current Project', async () => {
    setCompact(true);
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    const open = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Projects' }));
      return screen.getByRole('dialog', { name: 'Projects' });
    };
    const closed = () => expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(within(await open()).getByRole('button', { name: 'Close' }));
    closed();
    fireEvent(await open(), new Event('cancel', { cancelable: true }));
    closed();
    const drawer = await open();
    fireEvent.pointerDown(drawer, { clientX: 200, clientY: 300 });
    fireEvent.pointerUp(drawer, { clientX: 80, clientY: 310 });
    closed();
    fireEvent.click(await within(await open()).findByRole('link', { name: 'URL Shortener' }));
    closed();
    expect(screen.getByTestId('location')).toHaveTextContent('/p/url-shortener-k3xa9q2m7p');
  });

  it('creates a Project from the drawer', async () => {
    const created = { slug: 'search-q1w2e3r4t5', name: 'Search', updatedAt: at };
    setCompact(true);
    stubApi({
      'POST /api/projects': { status: 201, body: created },
      'GET /api/projects/search-q1w2e3r4t5': created,
      'GET /api/projects/search-q1w2e3r4t5/architecture': emptyArchitecture,
      'GET /api/projects/search-q1w2e3r4t5/messages': [],
      'GET /api/projects/search-q1w2e3r4t5/knowledge': noKnowledge,
    });
    renderAt('/p/url-shortener-k3xa9q2m7p');
    fireEvent.click(await screen.findByRole('button', { name: 'Projects' }));

    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Projects' })).getByRole('button', {
        name: 'New project',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'New project' });
    fireEvent.change(within(dialog).getByLabelText('Project name'), {
      target: { value: 'Search' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Search' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renames the Project from ⋯ in a dialog and follows the new slug', async () => {
    const renamed = { ...shortener, slug: 'link-service-k3xa9q2m7p', name: 'Link Service' };
    const rename = vi.fn(() => renamed);
    setCompact(true);
    stubApi({
      'PATCH /api/projects/url-shortener-k3xa9q2m7p': rename,
      'GET /api/projects/link-service-k3xa9q2m7p': renamed,
    });
    renderAt('/p/url-shortener-k3xa9q2m7p');

    fireEvent.click(await screen.findByRole('button', { name: 'Project actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const dialog = screen.getByRole('dialog', { name: 'Rename project' });
    fireEvent.change(within(dialog).getByLabelText('Project name'), {
      target: { value: 'Link Service' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/p/link-service-k3xa9q2m7p'),
    );
    expect(rename).toHaveBeenCalledWith(
      expect.objectContaining({ json: { name: 'Link Service' } }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('deletes the Project from ⋯ only after confirming', async () => {
    const remove = vi.fn(() => ({ status: 204 }));
    setCompact(true);
    stubApi({ 'DELETE /api/projects/url-shortener-k3xa9q2m7p': remove });
    renderAt('/p/url-shortener-k3xa9q2m7p');

    fireEvent.click(await screen.findByRole('button', { name: 'Project actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: /delete “URL Shortener”/i });
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete project' }));

    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/projects'));
    expect(remove).toHaveBeenCalled();
  });

  it('opens the account menu from the avatar in the bar', async () => {
    setCompact(true);
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');

    fireEvent.click(await screen.findByRole('button', { name: 'Account' }));

    expect(screen.getByRole('menuitem', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('keeps the draft, unsaved canvas edits and the tab across the breakpoint', async () => {
    stubApi({
      'PUT /api/projects/url-shortener-k3xa9q2m7p/architecture': ({
        json,
      }: {
        json?: unknown;
      }) => ({
        version: (json as { version: number }).version + 1,
      }),
    });
    renderAt('/p/url-shortener-k3xa9q2m7p');
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Half-typed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Requirements/ }));

    setCompact(true);

    expect(screen.getByRole('separator', { name: 'Resize panel' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Requirements/, selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue('Half-typed');
    expect(document.querySelector('.react-flow__node')).toHaveTextContent('Cache');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();

    setCompact(false);

    expect(screen.getByRole('button', { name: 'Hide chat' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Requirements/, selected: true })).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue('Half-typed');
    expect(document.querySelector('.react-flow__node')).toHaveTextContent('Cache');
  });
});

describe('Canvas on compact screens', () => {
  const architecture = {
    version: 3,
    document: {
      components: [
        { id: 'api', type: 'service', name: 'Links API', position: { x: 0, y: 0 } },
        { id: 'db', type: 'database', name: 'Links DB', position: { x: 300, y: 0 } },
      ],
      connections: [{ id: 'c1', source: 'api', target: 'db', kind: 'sync' }],
    },
  };
  const API = '/api/projects/url-shortener-k3xa9q2m7p';

  function setup() {
    setCompact(true);
    const save = vi.fn(({ json }: { json?: unknown }) => ({
      version: (json as { version: number }).version + 1,
    }));
    stubApi({ [`GET ${API}/architecture`]: architecture, [`PUT ${API}/architecture`]: save });
    renderAt('/p/url-shortener-k3xa9q2m7p');
    return save;
  }
  const sheet = () => within(screen.getByRole('complementary', { name: 'Project panel' }));
  const snap = () =>
    screen.getByRole('separator', { name: 'Resize panel' }).getAttribute('aria-valuetext');
  const selected = () => document.querySelector('.react-flow__node.selected');
  function savedNames(save: ReturnType<typeof setup>) {
    const call = save.mock.calls.at(-1);
    if (!call) throw new Error('nothing was saved');
    const { document } = call[0].json as { document: { components: { name: string }[] } };
    return document.components.map((c) => c.name);
  }

  it('opens the Inspector in the sheet on one tap, under the tabs', async () => {
    setup();

    fireEvent.click(await screen.findByText('Links API'));

    const inspector = within(sheet().getByRole('region', { name: 'Inspector' }));
    expect(inspector.getByText('Service')).toBeInTheDocument();
    expect(inspector.getByLabelText('Name')).toHaveValue('Links API');
    expect(sheet().getByRole('tab', { name: 'Conversation' })).toBeVisible();
    expect(screen.getByLabelText('Message')).not.toBeVisible();
    expect(screen.queryByText(/Click it again/)).not.toBeInTheDocument();
  });

  it('closes the Inspector from a tab, keeping the selection, and clears it from the pane', async () => {
    setup();
    fireEvent.click(await screen.findByText('Links API'));

    fireEvent.click(sheet().getByRole('tab', { name: /Requirements/ }));

    expect(screen.queryByRole('region', { name: 'Inspector' })).not.toBeInTheDocument();
    expect(selected()).toHaveTextContent('Links API');
    expect(screen.getByRole('tab', { name: /Requirements/, selected: true })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Links API'));
    expect(screen.getByRole('region', { name: 'Inspector' })).toBeInTheDocument();

    fireEvent.click(document.querySelector('.react-flow__pane') as Element);

    expect(screen.queryByRole('region', { name: 'Inspector' })).not.toBeInTheDocument();
    expect(selected()).toBeNull();
  });

  it('brings the sheet to half from peek or full when the Inspector opens', async () => {
    setup();
    await screen.findByText('Links API');
    const handle = screen.getByRole('separator', { name: 'Resize panel' });

    fireEvent.keyDown(handle, { key: 'Home' });
    fireEvent.click(screen.getByText('Links API'));
    expect(snap()).toBe('Half');

    fireEvent.click(sheet().getByRole('button', { name: 'Close' }));
    expect(selected()).toHaveTextContent('Links API');
    fireEvent.keyDown(handle, { key: 'End' });
    fireEvent.click(screen.getByText('Links DB'));
    expect(snap()).toBe('Half');
  });

  it('renames a Component in the sheet and autosaves it', async () => {
    const save = setup();
    fireEvent.click(await screen.findByText('Links API'));

    fireEvent.change(sheet().getByLabelText('Name'), { target: { value: 'Redirects' } });

    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 2000 });
    expect(savedNames(save)).toEqual(['Redirects', 'Links DB']);
  });

  it('removes a Component from the sheet and autosaves it', async () => {
    const save = setup();
    fireEvent.click(await screen.findByText('Links API'));

    fireEvent.click(sheet().getByRole('button', { name: 'Delete component' }));

    expect(screen.queryByText('Links API')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Inspector' })).not.toBeInTheDocument();
    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 2000 });
    expect(savedNames(save)).toEqual(['Links DB']);
  });

  it('adds from a "+ Add" grid of every Component Type, opening its Inspector unfocused', async () => {
    const save = setup();
    await screen.findByText('Links API');
    expect(screen.queryByRole('toolbar', { name: 'Add component' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const grid = within(screen.getByRole('dialog', { name: 'Add component' }));
    expect(grid.getAllByRole('button')).toHaveLength(13);
    fireEvent.click(grid.getByRole('button', { name: 'Cache' }));

    expect(screen.queryByRole('dialog', { name: 'Add component' })).not.toBeInTheDocument();
    expect(selected()).toHaveTextContent('Cache');
    expect(sheet().getByLabelText('Name')).toHaveValue('Cache');
    expect(sheet().getByLabelText('Name')).not.toHaveFocus();
    expect(document.activeElement?.tagName).not.toBe('INPUT');
    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: 2000 });
    expect(savedNames(save)).toEqual(['Links API', 'Links DB', 'Cache']);
  });

  it('closes the "+ Add" grid on Esc and on a tap outside it', async () => {
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Add' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Add component' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByTestId('add-backdrop'));
    expect(screen.queryByRole('dialog', { name: 'Add component' })).not.toBeInTheDocument();
    expect(screen.getByText('Links API')).toBeInTheDocument();
  });

  it("doesn't let Components be dragged, and keeps only Fit and Tidy up", async () => {
    setup();
    await screen.findByText('Links API');

    expect(document.querySelector('.react-flow__node.draggable')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom In' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zoom Out' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fit View' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tidy up' })).toBeInTheDocument();
  });
});

describe('Proposal banner on compact screens', () => {
  const at = '2026-09-30T00:00:00Z';
  const API = '/api/projects/url-shortener-k3xa9q2m7p';
  const addCache = {
    seq: 1,
    summary: 'Add a cache in front of the database so that redirects stay fast under load',
    status: 'pending',
    baseVersion: 0,
    changes: [{ op: 'add_component', ref: 'cache', type: 'cache', name: 'Order Cache' }],
  };

  function setup(proposal: unknown, extra: Parameters<typeof mockApi>[0] = {}) {
    setCompact(true);
    stubApi({
      [`GET ${API}/messages`]: [
        { role: 'assistant', body: 'Here is a cache.', createdAt: at, proposal },
      ],
      [`POST ${API}/reply`]: () =>
        sseResponse(['done', { role: 'assistant', body: 'Noted.', createdAt: at }]),
      ...extra,
    });
    renderAt('/p/url-shortener-k3xa9q2m7p');
  }
  const banner = async () => within(await screen.findByRole('region', { name: 'Proposal' }));

  it('shows the Proposal number with Accept and Reject, and accepts onto the canvas', async () => {
    const accept = vi.fn(() => ({ version: 1 }));
    setup(addCache, { [`POST ${API}/proposals/1/accept`]: accept });
    const bar = await banner();
    expect(bar.getByText('Proposal #1')).toBeInTheDocument();
    expect(bar.getByText(addCache.summary)).toBeInTheDocument();

    fireEvent.click(bar.getByRole('button', { name: 'Accept' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Proposal' })).not.toBeInTheDocument(),
    );
    expect(accept).toHaveBeenCalled();
    expect(document.querySelector('.react-flow__node')).toHaveTextContent('Order Cache');
    expect(document.querySelector('.react-flow__node')).not.toHaveTextContent('new');
  });

  it('rejects from the banner', async () => {
    const reject = vi.fn(() => ({ status: 204 }));
    setup(addCache, { [`POST ${API}/proposals/1/reject`]: reject });

    fireEvent.click((await banner()).getByRole('button', { name: 'Reject' }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Proposal' })).not.toBeInTheDocument(),
    );
    expect(reject).toHaveBeenCalled();
    expect(document.querySelector('.react-flow__node')).toBeNull();
  });

  it('says on a second line when it is out of date, and disables Accept', async () => {
    setup({ ...addCache, changes: [{ op: 'remove_component', id: 'gone' }] });
    const bar = await banner();

    expect(bar.getByText('Out of date. Ask the AI to redo it.')).toBeInTheDocument();
    expect(bar.getByRole('button', { name: 'Accept' })).toBeDisabled();
  });
});

// Widths in px with a 16px rem: min 20rem, default 24rem, and the canvas keeps at least 32rem
// beside the left pane (16rem open, 3rem collapsed).
describe('Workspace side panel width', () => {
  const MIN = 320;
  const DEFAULT = 384;
  const STORAGE_KEY = 'side-panel-width';

  function setViewportWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    window.dispatchEvent(new Event('resize'));
  }

  beforeEach(() => {
    localStorage.clear();
    setViewportWidth(1600); // max 832 with the sidebar open, 1040 with it collapsed
  });
  afterEach(() => {
    localStorage.clear();
    setViewportWidth(1024);
  });

  async function handle() {
    return screen.findByRole('separator', { name: 'Resize panel' });
  }
  const width = (separator: HTMLElement) => Number(separator.getAttribute('aria-valuenow'));

  function drag(separator: HTMLElement, from: number, to: number) {
    fireEvent.pointerDown(separator, { pointerId: 1, button: 0, clientX: from });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: to });
    fireEvent.pointerUp(separator, { pointerId: 1, clientX: to });
  }

  it('is a focusable vertical separator at the default width', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');

    const separator = await handle();

    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('tabindex', '0');
    expect(width(separator)).toBe(DEFAULT);
    expect(separator).toHaveAttribute('aria-valuemin', String(MIN));
    expect(separator).toHaveAttribute('aria-valuemax', '832');
  });

  it('widens and narrows the panel by dragging its border, for every tab', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    const separator = await handle();

    drag(separator, 1000, 900);
    expect(width(separator)).toBe(DEFAULT + 100);

    fireEvent.click(screen.getByRole('tab', { name: /Requirements/ }));
    drag(separator, 900, 950);
    expect(width(separator)).toBe(DEFAULT + 50);
    fireEvent.click(screen.getByRole('tab', { name: /Decisions/ }));
    expect(width(separator)).toBe(DEFAULT + 50);
  });

  it('stops dragging at the minimum width and where the canvas would get too narrow', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    const separator = await handle();

    drag(separator, 1000, 0);
    expect(width(separator)).toBe(832);

    drag(separator, 500, 1500);
    expect(width(separator)).toBe(MIN);
  });

  it('steps with the arrow keys and jumps to the bounds with Home and End', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    const separator = await handle();

    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(width(separator)).toBe(DEFAULT + 16);
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(width(separator)).toBe(DEFAULT - 16);

    fireEvent.keyDown(separator, { key: 'End' });
    expect(width(separator)).toBe(832);
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(width(separator)).toBe(MIN);
  });

  it('allows a wider panel while the project list is collapsed, and re-clamps when it opens', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    const separator = await handle();

    fireEvent.click(screen.getByRole('button', { name: 'Hide projects' }));
    expect(separator).toHaveAttribute('aria-valuemax', '1040');
    fireEvent.keyDown(separator, { key: 'End' });
    expect(width(separator)).toBe(1040);

    fireEvent.click(screen.getByRole('button', { name: 'Show projects' }));
    expect(separator).toHaveAttribute('aria-valuemax', '832');
    expect(width(separator)).toBe(832);
  });

  it('re-clamps when the window gets narrower', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    const separator = await handle();
    fireEvent.keyDown(separator, { key: 'End' });

    act(() => setViewportWidth(1400));

    expect(separator).toHaveAttribute('aria-valuemax', '632');
    expect(width(separator)).toBe(632);
  });

  it('resets to the default width on a double-click', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    const separator = await handle();
    drag(separator, 1000, 800);

    fireEvent.doubleClick(separator);

    expect(width(separator)).toBe(DEFAULT);
  });

  it('keeps the chosen width while the panel is collapsed to the rail', async () => {
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    drag(await handle(), 1000, 900);

    fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }));
    expect(screen.queryByRole('separator', { name: 'Resize panel' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show chat' }));

    expect(width(await handle())).toBe(DEFAULT + 100);
  });

  it('remembers the width in this browser', async () => {
    stubApi();
    const first = renderAt('/p/url-shortener-k3xa9q2m7p');
    drag(await handle(), 1000, 900);
    first.unmount();

    renderAt('/p/url-shortener-k3xa9q2m7p');

    expect(width(await handle())).toBe(DEFAULT + 100);
  });

  it.each([
    ['missing', null],
    ['invalid', 'wide'],
    ['below the minimum', '100'],
    ['beyond the maximum', '5000'],
  ])('falls back to the default width when the stored one is %s', async (_, stored) => {
    if (stored !== null) localStorage.setItem(STORAGE_KEY, stored);
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');

    expect(width(await handle())).toBe(DEFAULT);
  });

  it('still resizes at the default width when storage is blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    stubApi();
    renderAt('/p/url-shortener-k3xa9q2m7p');
    const separator = await handle();
    expect(width(separator)).toBe(DEFAULT);

    drag(separator, 1000, 900);

    expect(width(separator)).toBe(DEFAULT + 100);
  });
});
