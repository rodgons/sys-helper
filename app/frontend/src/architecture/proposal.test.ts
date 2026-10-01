import { describe, expect, it } from 'vitest';
import { type ArchitectureDocument, fromFlow, toFlow } from './model';
import {
  applyProposal,
  describeChange,
  type Proposal,
  previewProposal,
  staleReason,
} from './proposal';

const doc: ArchitectureDocument = {
  components: [
    { id: 'api', type: 'service', name: 'API', position: { x: 0, y: 0 } },
    {
      id: 'db',
      type: 'database',
      name: 'Orders DB',
      position: { x: 400, y: 0 },
      properties: { engine: 'PostgreSQL' },
    },
  ],
  connections: [{ id: 'k1', source: 'api', target: 'db', kind: 'sync' }],
};

const proposal = (changes: Proposal['changes']): Proposal => ({
  seq: 1,
  summary: 'Add a cache',
  status: 'pending',
  baseVersion: 3,
  changes,
});

const addCache = proposal([
  {
    op: 'add_component',
    ref: 'cache',
    type: 'cache',
    name: 'Session Cache',
    properties: { engine: 'Redis' },
  },
  { op: 'add_connection', source: 'api', target: 'cache', kind: 'sync', label: 'reads' },
  { op: 'update_component', id: 'db', properties: { replicas: '2' } },
  { op: 'update_connection', id: 'k1', label: 'writes' },
]);

describe('applyProposal', () => {
  it('adds, connects and updates, keeping existing positions', () => {
    const { nodes, edges } = toFlow(doc);

    const result = fromFlow(...applyProposal(nodes, edges, addCache));

    const cache = result.components.find((c) => c.name === 'Session Cache');
    expect(cache).toMatchObject({ type: 'cache', properties: { engine: 'Redis' } });
    expect(result.components.find((c) => c.id === 'api')?.position).toEqual({ x: 0, y: 0 });
    expect(result.components.find((c) => c.id === 'db')?.properties).toEqual({
      engine: 'PostgreSQL',
      replicas: '2',
    });
    expect(result.connections).toContainEqual(
      expect.objectContaining({ source: 'api', target: cache?.id, kind: 'sync', label: 'reads' }),
    );
    expect(result.connections.find((c) => c.id === 'k1')?.label).toBe('writes');
  });

  it('places new components clear of existing ones', () => {
    const { nodes, edges } = toFlow(doc);

    const [applied] = applyProposal(nodes, edges, addCache);

    const cache = applied.find((n) => n.data.name === 'Session Cache');
    for (const n of nodes) {
      const apart =
        Math.abs((cache?.position.x ?? 0) - n.position.x) >= 180 ||
        Math.abs((cache?.position.y ?? 0) - n.position.y) >= 90;
      expect(apart).toBe(true);
    }
  });

  it('removes a component together with its connections', () => {
    const { nodes, edges } = toFlow(doc);

    const result = fromFlow(
      ...applyProposal(nodes, edges, proposal([{ op: 'remove_component', id: 'db' }])),
    );

    expect(result.components.map((c) => c.id)).toEqual(['api']);
    expect(result.connections).toEqual([]);
  });
});

describe('staleReason', () => {
  it('is null while everything the proposal refers to still exists', () => {
    const { nodes, edges } = toFlow(doc);

    expect(staleReason(nodes, edges, addCache)).toBeNull();
  });

  it('names what the user removed since', () => {
    const { nodes, edges } = toFlow(doc);
    const withoutDb = nodes.filter((n) => n.id !== 'db');

    expect(staleReason(withoutDb, edges, addCache)).toMatch(/db/);
    expect(staleReason(nodes, [], addCache)).toMatch(/k1/);
  });
});

describe('previewProposal', () => {
  it('marks added, changed and removed items without touching the editor state', () => {
    const { nodes, edges } = toFlow(doc);
    const p = proposal([...addCache.changes, { op: 'remove_connection', id: 'k1' }]);

    const preview = previewProposal(nodes, edges, p);

    expect(preview.nodes.find((n) => n.data.name === 'Session Cache')?.data.diff).toBe('added');
    expect(preview.nodes.find((n) => n.id === 'db')?.data.diff).toBe('changed');
    expect(preview.nodes.find((n) => n.id === 'api')?.data.diff).toBeUndefined();
    expect(preview.edges.find((e) => e.id === 'k1')?.data?.diff).toBe('removed');
    expect(preview.edges.find((e) => e.data?.label === 'reads')?.data?.diff).toBe('added');
    expect(nodes.every((n) => n.data.diff === undefined)).toBe(true);
  });
});

describe('describeChange', () => {
  it('describes changes in words, using current names', () => {
    const names = { api: 'API', db: 'Orders DB', k1: 'API → Orders DB' };

    expect(addCache.changes.map((c) => describeChange(c, names, addCache.changes))).toEqual([
      'Add Cache “Session Cache” (engine: Redis)',
      'Connect API → Session Cache (sync, reads)',
      'Update Orders DB (replicas: 2)',
      'Update connection API → Orders DB (label: writes)',
    ]);
    expect(describeChange({ op: 'remove_component', id: 'db' }, names, [])).toBe(
      'Remove Orders DB',
    );
  });
});
