import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('adds a component from the catalog, selects it and autosaves', async () => {
    const save = stubSave();
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} />, {
      auth: signedIn(),
    });

    fireEvent.change(screen.getByLabelText('Add component'), { target: { value: 'cache' } });

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

  it('edits and deletes the selected component through the inspector', async () => {
    const save = stubSave();
    renderWithQuery(<ArchitectureCanvas slug="shop-k3xa9q2m7p" initial={initial} />, {
      auth: signedIn(),
    });
    fireEvent.change(screen.getByLabelText('Add component'), { target: { value: 'queue' } });

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
    fireEvent.change(screen.getByLabelText('Add component'), { target: { value: 'cache' } });

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
});
