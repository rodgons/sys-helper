import { act, fireEvent, screen } from '@testing-library/react';
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
});
