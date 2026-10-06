import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXPLANATIONS } from '../test/explanations';
import { mockApi, renderWithQuery, signedIn } from '../test/render';
import { ArchitectureCanvas } from './canvas';
import type { ArchitectureDocument } from './model';

const initial = {
  version: 3,
  document: {
    components: [
      { id: 'api', type: 'service', name: 'Orders API', position: { x: 0, y: 0 } },
      {
        id: 'db',
        type: 'database',
        name: 'Orders DB',
        position: { x: 300, y: 0 },
        properties: { engine: 'PostgreSQL' },
      },
    ],
    connections: [{ id: 'c1', source: 'api', target: 'db', kind: 'sync' as const }],
  },
};

function stubSave() {
  const save = vi.fn(({ json }: { json?: unknown }) => ({
    version: (json as { version: number }).version + 1,
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn(mockApi({ 'PUT /api/projects/shop-k3xa9q2m7p/architecture': save })),
  );
  return save;
}

function savedDocument(save: ReturnType<typeof stubSave>): ArchitectureDocument {
  const call = save.mock.calls.at(-1);
  if (!call) throw new Error('nothing was saved');
  return (call[0].json as { document: ArchitectureDocument }).document;
}

describe('ArchitectureCanvas', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows the saved components', () => {
    stubSave();
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} />, {
      auth: signedIn(),
    });

    expect(screen.getByText('Orders API')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('All changes saved');
  });

  it('adds a component from the dock, selects it and autosaves', async () => {
    const save = stubSave();
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} />, {
      auth: signedIn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));

    expect(screen.getByRole('region', { name: 'Inspector' })).toHaveTextContent('Cache');
    expect(screen.getByLabelText('Name')).toHaveValue('Cache');
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0].json).toMatchObject({ version: 3 });
    expect(savedDocument(save).components.map((c) => c.type)).toEqual([
      'service',
      'database',
      'cache',
    ]);
  });

  it('offers every component type in the dock at the bottom', () => {
    stubSave();
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} />, {
      auth: signedIn(),
    });

    const dock = screen.getByRole('toolbar', { name: 'Add component' });
    expect(within(dock).getAllByRole('button')).toHaveLength(13);
    expect(within(dock).getByRole('button', { name: 'Add Load Balancer' })).toBeInTheDocument();
  });

  it('adds a component where it is dropped from the dock', async () => {
    const save = stubSave();
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} />, {
      auth: signedIn(),
    });
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => data.set(k, v),
      getData: (k: string) => data.get(k) ?? '',
      types: [] as string[],
      effectAllowed: '',
      dropEffect: '',
    };

    fireEvent.dragStart(screen.getByRole('button', { name: 'Add Queue / Stream' }), {
      dataTransfer,
    });
    dataTransfer.types = [...data.keys()];
    fireEvent.dragOver(screen.getByTestId('rf__wrapper'), { dataTransfer });
    fireEvent.drop(screen.getByTestId('rf__wrapper'), { dataTransfer, clientX: 40, clientY: 50 });

    expect(screen.getByLabelText('Name')).toHaveValue('Queue / Stream');
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(savedDocument(save).components.map((c) => c.type)).toContain('queue');
  });

  it('draws each component in the shape of its type', () => {
    stubSave();
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} />, {
      auth: signedIn(),
    });

    const shapeOf = (name: string) =>
      screen.getByText(name).closest('[data-shape]')?.getAttribute('data-shape');
    expect(shapeOf('Orders DB')).toBe('cylinder');
    expect(shapeOf('Orders API')).toBe('rounded');
  });

  it('edits the selected component in a window attached to it, which closes', () => {
    stubSave();
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} />, {
      auth: signedIn(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));

    // React Flow positions node toolbars next to their node and moves them with it.
    const editor = screen.getByRole('region', { name: 'Inspector' });
    const selected = document.querySelector('.react-flow__node.selected');
    expect(editor.closest('.react-flow__node-toolbar')).toHaveAttribute(
      'data-id',
      selected?.getAttribute('data-id'),
    );

    fireEvent.click(within(editor).getByRole('button', { name: 'Close' }));

    // Closing keeps the component selected, and the rest of the canvas dimmed around it.
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(document.querySelector('.react-flow__node.selected')).toHaveTextContent('Cache');
    expect(document.querySelectorAll('[data-dimmed]')).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Inspector' })).toHaveTextContent(/Click it again/);
  });

  it('opens the window of a component clicked again once selected', () => {
    stubSave();
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} />, {
      auth: signedIn(),
    });

    fireEvent.click(screen.getByText('Orders API'));
    expect(document.querySelector('.react-flow__node.selected')).toHaveTextContent('Orders API');
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Orders API'));
    expect(screen.getByLabelText('Name')).toHaveValue('Orders API');

    // Esc closes the window first, then clears the selection.
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    expect(document.querySelector('.react-flow__node.selected')).not.toBeNull();
    fireEvent.keyDown(screen.getByTestId('rf__wrapper'), { key: 'Escape' });
    expect(document.querySelector('.react-flow__node.selected')).toBeNull();

    // Clicking another component only selects it, even after a window was open.
    fireEvent.click(screen.getByText('Orders API'));
    fireEvent.click(screen.getByText('Orders API'));
    fireEvent.click(screen.getByText('Orders DB'));
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Orders API'));
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('dims everything but the clicked component and what it connects to, until deselected', () => {
    stubSave();
    const withCache = {
      ...initial,
      document: {
        ...initial.document,
        components: [
          ...initial.document.components,
          { id: 'cache', type: 'cache', name: 'Sessions', position: { x: 0, y: 200 } },
        ],
      },
    };
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={withCache} />, {
      auth: signedIn(),
    });
    const dimmed = () =>
      [...document.querySelectorAll('[data-dimmed]')].map((n) => n.textContent ?? '');

    expect(dimmed()).toEqual([]);
    fireEvent.click(screen.getByText('Orders API'));
    expect(dimmed()).toEqual([expect.stringContaining('Sessions')]);

    fireEvent.click(screen.getByText('Sessions'));
    expect(dimmed()).toHaveLength(2);

    fireEvent.keyDown(screen.getByTestId('rf__wrapper'), { key: 'Escape' });
    expect(dimmed()).toEqual([]);
  });

  it('edits and deletes the selected component through the inspector', async () => {
    const save = stubSave();
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} />, {
      auth: signedIn(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Queue / Stream' }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Order events' } });
    fireEvent.change(screen.getByLabelText('Engine'), { target: { value: 'Kafka' } });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(savedDocument(save).components.at(-1)).toMatchObject({
      type: 'queue',
      name: 'Order events',
      properties: { engine: 'Kafka' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Delete component' }));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(savedDocument(save).components.map((c) => c.name)).toEqual(['Orders API', 'Orders DB']);
  });

  it('tidies up the layout and autosaves it', async () => {
    const save = stubSave();
    const tangled = {
      ...initial,
      document: {
        ...initial.document,
        components: [
          { id: 'api', type: 'service', name: 'Orders API', position: { x: 600, y: 400 } },
          { id: 'db', type: 'database', name: 'Orders DB', position: { x: 0, y: 0 } },
        ],
      },
    };
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={tangled} />, {
      auth: signedIn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Tidy up' }));
    await act(() => vi.advanceTimersByTimeAsync(1000));

    const [api, db] = savedDocument(save).components;
    expect(api?.position.x).toBeLessThan(db?.position.x ?? 0);
    expect(api?.position.y).toBe(db?.position.y);
  });

  describe('with a pending proposal', () => {
    const proposal = {
      seq: 2,
      summary: 'Add a cache in front of the database',
      status: 'pending' as const,
      baseVersion: 3,
      changes: [
        { op: 'add_component' as const, ref: 'cache', type: 'cache', name: 'Order Cache' },
        { op: 'add_connection' as const, source: 'api', target: 'cache', kind: 'sync' as const },
        { op: 'remove_connection' as const, id: 'c1' },
      ],
    };

    function setup(p = proposal) {
      const accept = vi.fn(({ json }: { json?: unknown }) => ({
        version: (json as { version: number }).version + 1,
      }));
      const reject = vi.fn(() => ({ status: 'rejected' }));
      vi.stubGlobal(
        'fetch',
        vi.fn(
          mockApi({
            'POST /api/projects/shop-k3xa9q2m7p/proposals/2/accept': accept,
            'POST /api/projects/shop-k3xa9q2m7p/proposals/2/reject': reject,
          }),
        ),
      );
      const onReview = vi.fn();
      renderWithQuery(
        <ArchitectureCanvas
          slug="shop-k3xa9q2m7p"
          initial={initial}
          proposal={p}
          onReview={onReview}
        />,
        {
          auth: signedIn(),
        },
      );
      return { accept, reject, onReview };
    }

    it('previews the changes and publishes the review', () => {
      const { onReview } = setup();

      expect(screen.getByText('Order Cache')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Proposal' })).toHaveTextContent(
        'Add a cache in front of the database',
      );
      expect(onReview).toHaveBeenLastCalledWith(
        expect.objectContaining({ seq: 2, stale: null, busy: false }),
      );
      expect(onReview.mock.lastCall?.[0].names).toMatchObject({
        api: 'Orders API',
        db: 'Orders DB',
      });
    });

    it('accepts by saving the applied architecture from the current version', async () => {
      const { accept } = setup();

      fireEvent.click(
        within(screen.getByRole('region', { name: 'Proposal' })).getByRole('button', {
          name: 'Accept',
        }),
      );
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(accept).toHaveBeenCalledTimes(1);
      const body = accept.mock.calls[0]?.[0].json as {
        version: number;
        document: ArchitectureDocument;
      };
      expect(body.version).toBe(3);
      expect(body.document.components.map((c) => c.name)).toEqual([
        'Orders API',
        'Orders DB',
        'Order Cache',
      ]);
      expect(body.document.connections).toEqual([
        { id: 'p2-k1', source: 'api', target: 'p2-cache', kind: 'sync' },
      ]);
      expect(screen.getByRole('status')).toHaveTextContent('All changes saved');
    });

    it('stops previewing an accepted proposal before the conversation catches up', async () => {
      // Until the cached Conversation marks it accepted, the proposal still arrives as pending; the
      // preview must not apply it a second time on top of the canvas that now includes it.
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      // Only additions: nothing it refers to goes away, so it never turns stale by itself.
      setup({ ...proposal, changes: proposal.changes.slice(0, 2) });

      fireEvent.click(
        within(screen.getByRole('region', { name: 'Proposal' })).getByRole('button', {
          name: 'Accept',
        }),
      );
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(screen.getAllByText('Order Cache')).toHaveLength(1);
      expect(error.mock.calls.flat().join(' ')).not.toMatch(/same key/);
    });

    it('keeps the proposal when the canvas is edited during a slow accept', async () => {
      let respond: () => void = () => {};
      const accept = vi.fn(
        ({ json }: { json?: unknown }) =>
          new Promise((resolve) => {
            respond = () => resolve({ version: (json as { version: number }).version + 1 });
          }),
      );
      const save = vi.fn(({ json }: { json?: unknown }) => ({
        version: (json as { version: number }).version + 1,
      }));
      vi.stubGlobal(
        'fetch',
        vi.fn(
          mockApi({
            'POST /api/projects/shop-k3xa9q2m7p/proposals/2/accept': accept,
            'PUT /api/projects/shop-k3xa9q2m7p/architecture': save,
          }),
        ),
      );
      renderWithQuery(
        <ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} proposal={proposal} />,
        { auth: signedIn() },
      );

      fireEvent.click(
        within(screen.getByRole('region', { name: 'Proposal' })).getByRole('button', {
          name: 'Accept',
        }),
      );
      await act(() => vi.advanceTimersByTimeAsync(0));
      expect(accept).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));
      await act(async () => {
        respond();
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(screen.getByText('Order Cache')).toBeInTheDocument();
      for (const call of save.mock.calls) {
        const doc = (call[0].json as { document: ArchitectureDocument }).document;
        expect(doc.components.map((c) => c.id)).toContain('p2-cache');
      }
    });

    it('counts the previewed connections when dimming around the clicked component', () => {
      setup();

      fireEvent.click(screen.getByText('Orders DB'));

      // The removed connection still joins it to the API; the new cache only touches the API.
      const dimmed = [...document.querySelectorAll('[data-dimmed]')];
      expect(dimmed.map((n) => n.textContent)).toEqual([expect.stringContaining('Order Cache')]);
    });

    it("can't be tidied up while it is previewed, which would move its new components", () => {
      setup();

      expect(screen.getByRole('button', { name: 'Tidy up' })).toBeDisabled();
    });

    it('rejects', async () => {
      const { reject } = setup();

      fireEvent.click(
        within(screen.getByRole('region', { name: 'Proposal' })).getByRole('button', {
          name: 'Reject',
        }),
      );
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(reject).toHaveBeenCalledTimes(1);
    });

    it('cannot be accepted once the user removed what it refers to', () => {
      const { onReview } = setup({
        ...proposal,
        changes: [{ op: 'remove_component' as const, id: 'gone' }] as never,
      });

      const bar = screen.getByRole('region', { name: 'Proposal' });
      expect(bar).toHaveTextContent(/out of date/i);
      expect(within(bar).getByRole('button', { name: 'Accept' })).toBeDisabled();
      expect(onReview.mock.lastCall?.[0].stale).toMatch(/gone/);
    });
  });

  it('adds a decision to the selected component once it is saved', async () => {
    const decide = vi.fn((_req: { json?: unknown }) => ({ status: 201, body: {} }));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        mockApi({
          'PUT /api/projects/shop-k3xa9q2m7p/architecture': ({ json }: { json?: unknown }) => ({
            version: (json as { version: number }).version + 1,
          }),
          'GET /api/projects/shop-k3xa9q2m7p/knowledge': {
            experienceLevel: '',
            requirements: [{ id: 'R1', category: 'scale', statement: '10k rps' }],
            decisions: [],
          },
          'POST /api/projects/shop-k3xa9q2m7p/decisions': decide,
        }),
      ),
    );
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} />, {
      auth: signedIn(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Cache' }));

    const inspector = screen.getByRole('region', { name: 'Inspector' });
    await act(() => vi.advanceTimersByTimeAsync(0)); // load the knowledge
    expect(within(inspector).getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    fireEvent.click(within(inspector).getByRole('button', { name: '+ Add decision' }));
    fireEvent.change(within(inspector).getByLabelText('Decision'), {
      target: { value: 'Redis for sessions' },
    });
    fireEvent.change(within(inspector).getByLabelText('Why'), {
      target: { value: 'Fast and simple' },
    });
    fireEvent.click(within(inspector).getByLabelText(/R1/));
    fireEvent.click(within(inspector).getByRole('button', { name: 'Add decision' }));
    await act(() => vi.advanceTimersByTimeAsync(0));

    const body = decide.mock.calls[0]?.[0].json as {
      targets: string[];
      requirements: string[];
      title: string;
    };
    expect(body.title).toBe('Redis for sessions');
    expect(body.requirements).toEqual(['R1']);
    expect(body.targets).toHaveLength(1);
    expect(body.targets[0]).toMatch(/^c-/);
  });

  describe('explanations in the Inspector', () => {
    function setup(decisions: unknown[] = []) {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          mockApi({
            'PUT /api/projects/shop-k3xa9q2m7p/architecture': ({ json }: { json?: unknown }) => ({
              version: (json as { version: number }).version + 1,
            }),
            'GET /api/projects/shop-k3xa9q2m7p/knowledge': {
              experienceLevel: 'beginner',
              requirements: [],
              decisions,
            },
            'GET /api/explanations': EXPLANATIONS,
          }),
        ),
      );
      renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} />, {
        auth: signedIn(),
      });
    }

    it("explains the selected component's type", async () => {
      setup();

      fireEvent.click(screen.getByRole('button', { name: 'Add API Gateway' }));
      await act(() => vi.advanceTimersByTimeAsync(0));

      const inspector = screen.getByRole('region', { name: 'Inspector' });
      fireEvent.click(within(inspector).getByText('What is API Gateway?'));
      expect(within(inspector).getByText('The front door for client calls.')).toBeInTheDocument();
      expect(within(inspector).getByRole('tabpanel')).toHaveTextContent('A receptionist.');
    });

    it('offers no explanation for a Custom component', async () => {
      setup();

      fireEvent.click(screen.getByRole('button', { name: 'Add Custom' }));
      await act(() => vi.advanceTimersByTimeAsync(0));

      expect(screen.getByRole('region', { name: 'Inspector' })).not.toHaveTextContent(/What is/);
    });

    it("shows a decision's pattern with its explanation", async () => {
      setup([
        {
          id: 'D1',
          title: 'Postgres for orders',
          rationale: 'Transactions.',
          pattern: 'partitioning',
          patternId: 'sharding',
          alternative: 'DynamoDB',
          requirements: [],
          targets: ['db'],
          author: 'ai',
          needsReview: false,
        },
      ]);

      fireEvent.click(screen.getByText('Orders DB'));
      fireEvent.click(screen.getByText('Orders DB'));
      await act(() => vi.advanceTimersByTimeAsync(0));

      const decision = within(screen.getByRole('region', { name: 'Inspector' })).getByRole(
        'article',
        { name: 'D1 Postgres for orders' },
      );
      expect(decision).toHaveTextContent('partitioning');
      expect(decision).not.toHaveTextContent('DynamoDB');
      fireEvent.click(within(decision).getByText('What is Sharding?'));
      expect(within(decision).getByRole('tabpanel')).toHaveTextContent('Shelves.');
    });
  });
});
