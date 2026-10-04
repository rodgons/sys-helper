import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderWithQuery, signedIn } from '../test/render';
import { ArchitectureCanvas, type CompactSheet } from './canvas';
import type { ArchitectureDocument } from './model';

const SLUG = 'shop-k3xa9q2m7p';
const API = `/api/projects/${SLUG}`;

const initial = {
  version: 3,
  document: {
    components: [
      { id: 'api', type: 'service', name: 'Orders API', position: { x: 0, y: 0 } },
      { id: 'db', type: 'database', name: 'Orders DB', position: { x: 300, y: 0 } },
    ],
    connections: [{ id: 'c1', source: 'api', target: 'db', kind: 'sync' as const }],
  },
};

type Save = ReturnType<typeof vi.fn<(req: { json?: unknown }) => unknown>>;

function stubSave(routes: Parameters<typeof mockApi>[0] = {}): Save {
  const save = vi.fn(({ json }: { json?: unknown }) => ({
    version: (json as { version: number }).version + 1,
  }));
  vi.stubGlobal('fetch', vi.fn(mockApi({ [`PUT ${API}/architecture`]: save, ...routes })));
  return save;
}

function render(props: { initial?: typeof initial; sheet?: CompactSheet } = {}) {
  return renderWithQuery(
    <ArchitectureCanvas slug={SLUG} initial={props.initial ?? initial} sheet={props.sheet} />,
    { auth: signedIn() },
  );
}

function saved(save: Save): ArchitectureDocument {
  const call = save.mock.calls.at(-1);
  if (!call) throw new Error('nothing was saved');
  return (call[0].json as { document: ArchitectureDocument }).document;
}

const names = (doc: ArchitectureDocument) => doc.components.map((c) => c.name);
const undoButton = () => screen.getByRole('button', { name: /^Undo/ });
const redoButton = () => screen.getByRole('button', { name: /^Redo/ });
const settle = () => act(() => vi.advanceTimersByTimeAsync(1000));
// Components on the canvas, by id; not the ghosts of what an undo or redo just removed.
const onCanvas = () =>
  [...document.querySelectorAll('.react-flow__node')]
    .filter((n) => !n.textContent?.includes('· removed'))
    .map((n) => n.getAttribute('data-id'));
const node = (id: string) =>
  document.querySelector(`.react-flow__node[data-id="${id}"]`) as HTMLElement;

describe('Undo and redo on the canvas', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('has nothing to undo or redo on a fresh canvas', () => {
    stubSave();
    render();

    expect(undoButton()).toBeDisabled();
    expect(undoButton()).toHaveAccessibleName('Undo');
    expect(undoButton()).toHaveAttribute('title', 'Undo (Ctrl+Z)');
    expect(redoButton()).toBeDisabled();
    expect(redoButton()).toHaveAttribute('title', 'Redo (Ctrl+Y)');
  });

  it('undoes and redoes adding a Component, saving each, and names the step', async () => {
    const save = stubSave();
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));
    await settle();

    expect(undoButton()).toHaveAccessibleName('Undo Add Cache');
    expect(undoButton()).toHaveAttribute('title', 'Undo Add Cache (Ctrl+Z)');
    fireEvent.click(undoButton());

    expect(onCanvas()).toEqual(['api', 'db']);
    await settle();
    expect(names(saved(save))).toEqual(['Orders API', 'Orders DB']);
    expect(redoButton()).toHaveAccessibleName('Redo Add Cache');
    expect(redoButton()).toHaveAttribute('title', 'Redo Add Cache (Ctrl+Y)');
    expect(undoButton()).toBeDisabled();

    fireEvent.click(redoButton());

    expect(onCanvas()).toHaveLength(3);
    await settle();
    expect(names(saved(save))).toEqual(['Orders API', 'Orders DB', 'Cache']);
    expect(redoButton()).toBeDisabled();
  });

  it('clears redo on a new edit', () => {
    stubSave();
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));
    fireEvent.click(undoButton());
    expect(redoButton()).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Add Queue / Stream' }));

    expect(redoButton()).toBeDisabled();
    expect(undoButton()).toHaveAccessibleName('Undo Add Queue / Stream');
  });

  it('undoes a connection in one step', async () => {
    const save = stubSave();
    render();

    fireEvent.click(
      document.querySelector('.react-flow__handle.source[data-nodeid="db"]') as Element,
    );
    fireEvent.click(
      document.querySelector('.react-flow__handle.target[data-nodeid="api"]') as Element,
    );
    await settle();
    expect(saved(save).connections).toHaveLength(2);
    expect(undoButton()).toHaveAccessibleName('Undo Connect Orders DB → Orders API');

    fireEvent.click(undoButton());
    await settle();

    expect(saved(save).connections.map((c) => c.id)).toEqual(['c1']);
  });

  it('undoes a move in one step', async () => {
    const save = stubSave();
    render();
    fireEvent.click(screen.getByText('Orders API'));

    fireEvent.keyDown(node('api'), { key: 'ArrowRight' });
    expect(undoButton()).toHaveAccessibleName('Undo Move Orders API');
    fireEvent.click(undoButton());
    await settle();

    expect(saved(save).components[0]?.position).toEqual({ x: 0, y: 0 });
  });

  it("undoes the Inspector's Delete in one step, with the Connections it took along", async () => {
    const save = stubSave();
    render();
    fireEvent.click(screen.getByText('Orders API'));
    fireEvent.click(screen.getByText('Orders API'));

    fireEvent.click(screen.getByRole('button', { name: 'Delete component' }));
    expect(undoButton()).toHaveAccessibleName('Undo Delete Orders API');
    fireEvent.click(undoButton());
    await settle();

    expect(saved(save)).toEqual(initial.document);
  });

  it("undoes a Backspace delete in one step, with the Component's Connections", async () => {
    const save = stubSave();
    render();
    fireEvent.click(screen.getByText('Orders API'));

    fireEvent.keyDown(document.body, { key: 'Backspace' });
    fireEvent.keyUp(document.body, { key: 'Backspace' });
    await settle();
    expect(saved(save)).toEqual({
      ...initial.document,
      components: [initial.document.components[1]],
      connections: [],
    });
    expect(undoButton()).toHaveAccessibleName('Undo Delete Orders API');

    fireEvent.click(undoButton());
    await settle();

    expect(saved(save)).toEqual(initial.document);
    expect(undoButton()).toBeDisabled();
  });

  it('undoes typing in one field as one step, ended by leaving the field', async () => {
    const save = stubSave();
    render();
    fireEvent.click(screen.getByText('Orders DB'));
    fireEvent.click(screen.getByText('Orders DB'));
    const name = screen.getByLabelText('Name');

    for (const value of ['O', 'Or', 'Ord', 'Orders']) fireEvent.change(name, { target: { value } });
    fireEvent.blur(name);
    fireEvent.change(name, { target: { value: 'Orders store' } });
    fireEvent.change(screen.getByLabelText('Replicas'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Replicas'), { target: { value: '2 read' } });
    expect(undoButton()).toHaveAccessibleName('Undo Edit Orders store');

    fireEvent.click(undoButton());
    expect(screen.getByLabelText('Replicas')).toHaveValue('');
    fireEvent.click(undoButton());
    expect(screen.getByLabelText('Name')).toHaveValue('Orders');
    fireEvent.click(undoButton());
    expect(screen.getByLabelText('Name')).toHaveValue('Orders DB');
    expect(undoButton()).toBeDisabled();
    await settle();
    expect(saved(save)).toEqual(initial.document);
  });

  it('ends a typing run at any other edit', () => {
    stubSave();
    render();
    fireEvent.click(screen.getByText('Orders DB'));
    fireEvent.click(screen.getByText('Orders DB'));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Orders' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tidy up' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Orders store' } });

    fireEvent.click(undoButton());
    fireEvent.click(undoButton());
    expect(screen.getByText('Orders')).toBeInTheDocument();
  });

  it('undoes Tidy up in one step', async () => {
    const save = stubSave();
    render({
      initial: {
        ...initial,
        document: {
          ...initial.document,
          components: initial.document.components.map((c, i) => ({
            ...c,
            position: { x: 600 * (1 - i), y: 400 * (1 - i) },
          })),
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tidy up' }));
    expect(undoButton()).toHaveAccessibleName('Undo Tidy up');
    fireEvent.click(undoButton());
    await settle();

    expect(saved(save).components.map((c) => c.position)).toEqual([
      { x: 600, y: 400 },
      { x: 0, y: 0 },
    ]);
  });

  it('leaves history alone when selecting, panning and zooming', () => {
    stubSave();
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));
    fireEvent.click(undoButton());

    fireEvent.click(screen.getByText('Orders API'));
    fireEvent.keyDown(screen.getByTestId('rf__wrapper'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom In' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fit View' }));

    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toHaveAccessibleName('Redo Add Cache');
  });

  it('undoes with ⌘Z or Ctrl+Z and redoes with ⇧⌘Z, Ctrl+Shift+Z or Ctrl+Y', () => {
    stubSave();
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    const canvas = screen.getByTestId('rf__wrapper');
    const cacheShown = () => onCanvas().length === 3;

    fireEvent.keyDown(canvas, { key: 'z', metaKey: true });
    expect(cacheShown()).toBe(false);
    fireEvent.keyDown(canvas, { key: 'z', metaKey: true, shiftKey: true });
    expect(cacheShown()).toBe(true);
    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });
    expect(cacheShown()).toBe(false);
    fireEvent.keyDown(canvas, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(cacheShown()).toBe(true);
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(cacheShown()).toBe(false);
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true });
    expect(cacheShown()).toBe(true);
  });

  it('leaves ⌘Z in a text field to the field', () => {
    stubSave();
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));

    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'z', metaKey: true });
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'z', ctrlKey: true });

    expect(screen.getByLabelText('Name')).toHaveValue('Cache');
    expect(undoButton()).toBeEnabled();
  });

  it('disables undo and redo once a save conflicts', async () => {
    stubSave({ [`PUT ${API}/architecture`]: { status: 409, body: { error: 'conflict' } } });
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));
    await settle();

    expect(screen.getByRole('alert')).toHaveTextContent(/changed in another tab/);
    expect(undoButton()).toBeDisabled();
    fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
    expect(onCanvas()).toHaveLength(3);
  });

  it('keeps the last 100 steps', async () => {
    const save = stubSave();
    // One Component nudged 101 times keeps the canvas small, so the test stays fast.
    const [api] = initial.document.components;
    render({ initial: { version: 3, document: { components: [api], connections: [] } } as never });
    fireEvent.click(screen.getByText('Orders API'));

    for (let i = 0; i < 101; i++) fireEvent.keyDown(node('api'), { key: 'ArrowRight' });
    for (let i = 0; i < 100; i++) fireEvent.click(undoButton());

    expect(undoButton()).toBeDisabled();
    await settle();
    expect(saved(save).components[0]?.position).toEqual({ x: 5, y: 0 });
  });

  it('selects what an undo restored, without opening the Inspector', () => {
    stubSave();
    render();
    fireEvent.click(screen.getByText('Orders API'));
    fireEvent.click(screen.getByText('Orders API'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete component' }));

    fireEvent.click(undoButton());

    expect(document.querySelector('.react-flow__node.selected')).toHaveAttribute('data-id', 'api');
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('clears the selection when undoing an add', () => {
    stubSave();
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));

    fireEvent.click(undoButton());

    expect(document.querySelector('.react-flow__node.selected')).toBeNull();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('pans to what an undo changed when none of it is in view, keeping the zoom', async () => {
    stubSave();
    render({
      initial: {
        ...initial,
        document: {
          ...initial.document,
          components: [
            initial.document.components[0],
            { ...initial.document.components[1], position: { x: 5000, y: 4000 } },
          ] as typeof initial.document.components,
        },
      },
    });
    const viewport = () =>
      (document.querySelector('.react-flow__viewport') as HTMLElement).style.transform;
    fireEvent.click(screen.getByText('Orders DB'));
    fireEvent.keyDown(node('db'), { key: 'ArrowRight' });
    await settle();
    const before = viewport();

    fireEvent.click(undoButton());
    await settle();

    expect(viewport()).not.toBe(before);
    expect(viewport().match(/scale\(([\d.]+)\)/)?.[1]).toBe(before.match(/scale\(([\d.]+)\)/)?.[1]);
  });

  it('flashes what an undo or redo changed for 1.5s', async () => {
    stubSave();
    render();
    fireEvent.click(screen.getByText('Orders DB'));
    fireEvent.keyDown(node('db'), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));
    const cache = onCanvas().find((id) => !['api', 'db'].includes(id ?? '')) as string;

    fireEvent.click(undoButton());
    // An undone add stays a moment as a struck-through ghost.
    expect(node(cache)).toHaveTextContent('· removed');
    fireEvent.click(undoButton());
    expect(node('db')).toHaveTextContent('· changed');
    fireEvent.click(redoButton());
    expect(node('db')).toHaveTextContent('· changed');
    fireEvent.click(redoButton());
    expect(node(cache)).toHaveTextContent('· new');

    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(node(cache)).not.toHaveTextContent('· new');
    expect(document.querySelector('.react-flow__nodes')).not.toHaveTextContent(
      /· (new|changed|removed)/,
    );
  });

  it('ends the flash at the next edit', () => {
    stubSave();
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));
    fireEvent.click(undoButton());

    fireEvent.click(screen.getByRole('button', { name: 'Add DNS' }));

    expect(document.querySelector('.react-flow__nodes')).not.toHaveTextContent(
      /· (new|changed|removed)/,
    );
  });

  it('announces each undo and redo, beside the one status', () => {
    stubSave();
    render();
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));

    fireEvent.click(undoButton());
    expect(screen.getByText('Undid Add Cache')).toBeInTheDocument();
    fireEvent.click(redoButton());
    expect(screen.getByText('Redid Add Cache')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('sits beside Fit and Tidy up on compact screens', () => {
    stubSave();
    render({ sheet: { host: null, open: false, onOpenChange: vi.fn() } });

    const controls = document.querySelector('.react-flow__controls') as HTMLElement;
    expect(
      within(controls)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Fit View', 'Undo', 'Redo', 'Tidy up']);
  });

  describe('with a Proposal', () => {
    const proposal = {
      seq: 2,
      summary: 'Add a cache in front of the database',
      status: 'pending' as const,
      baseVersion: 3,
      changes: [
        { op: 'add_component' as const, ref: 'cache', type: 'cache', name: 'Order Cache' },
        { op: 'add_connection' as const, source: 'api', target: 'cache', kind: 'sync' as const },
      ],
    };
    const acceptRoute = `POST ${API}/proposals/2/accept`;
    const acceptButton = () =>
      within(screen.getByRole('region', { name: 'Proposal' })).getByRole('button', {
        name: 'Accept',
      });

    function renderWith(p: typeof proposal = proposal) {
      return renderWithQuery(<ArchitectureCanvas slug={SLUG} initial={initial} proposal={p} />, {
        auth: signedIn(),
      });
    }

    it('undoes and redoes an accept as one step, leaving it accepted', async () => {
      const accept = vi.fn(({ json }: { json?: unknown }) => ({
        version: (json as { version: number }).version + 1,
      }));
      const save = stubSave({ [acceptRoute]: accept });
      renderWith();

      fireEvent.click(acceptButton());
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(undoButton()).toHaveAccessibleName('Undo Accept Proposal #2');
      expect(undoButton()).toHaveAttribute('title', 'Undo Accept Proposal #2 (Ctrl+Z)');
      expect(save).not.toHaveBeenCalled();

      fireEvent.click(undoButton());
      await settle();
      expect(saved(save)).toEqual(initial.document);
      expect(save.mock.calls.at(-1)?.[0].json).toMatchObject({ version: 4 });
      expect(screen.queryByRole('region', { name: 'Proposal' })).not.toBeInTheDocument();

      fireEvent.click(redoButton());
      await settle();
      expect(names(saved(save))).toEqual(['Orders API', 'Orders DB', 'Order Cache']);
      expect(accept).toHaveBeenCalledTimes(1);
    });

    it('records nothing when the accept fails', async () => {
      stubSave({ [acceptRoute]: { status: 409, body: { error: 'not_pending' } } });
      renderWith();

      fireEvent.click(acceptButton());
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(screen.getByText(/already accepted or rejected/)).toBeInTheDocument();
      expect(undoButton()).toBeDisabled();
    });

    it('disables undo while the accept is in flight', async () => {
      let respond: () => void = () => {};
      stubSave({
        [acceptRoute]: () =>
          new Promise((resolve) => {
            respond = () => resolve({ version: 4 });
          }),
      });
      renderWith();
      fireEvent.click(screen.getByText('Orders API'));
      fireEvent.keyDown(node('api'), { key: 'ArrowRight' });

      fireEvent.click(acceptButton());
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(undoButton()).toBeDisabled();
      fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true });
      await act(async () => {
        respond();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(undoButton()).toHaveAccessibleName('Undo Accept Proposal #2');
    });

    it('keeps the preview in view through an undo', () => {
      stubSave();
      renderWith();
      fireEvent.click(screen.getByRole('button', { name: 'Add DNS' }));

      fireEvent.click(undoButton());

      expect(screen.getByText('Order Cache')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Proposal' })).toBeInTheDocument();
      expect(acceptButton()).toBeEnabled();
    });

    it('turns out of date when an undo takes away what it changes, and back with redo', () => {
      stubSave();
      const updatesCache = {
        ...proposal,
        changes: [{ op: 'update_component' as const, id: 'c-cache000', name: 'Session Cache' }],
      };
      // The Proposal updates a Component the User adds, so undoing the add makes it stale.
      vi.spyOn(crypto, 'randomUUID').mockReturnValue('cache000-0000-0000-0000-000000000000');
      renderWith(updatesCache as never);
      expect(screen.getByRole('region', { name: 'Proposal' })).toHaveTextContent(/out of date/i);
      fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));
      expect(acceptButton()).toBeEnabled();

      fireEvent.click(undoButton());
      expect(acceptButton()).toBeDisabled();
      expect(screen.getByRole('region', { name: 'Proposal' })).toHaveTextContent(/out of date/i);
      // The preview isn't hidden by the flash.
      fireEvent.click(redoButton());
      expect(acceptButton()).toBeEnabled();
      expect(screen.getByText('Session Cache')).toBeInTheDocument();
    });
  });
});
