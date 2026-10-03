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

describe('applyProposal on items the same proposal adds', () => {
  const p = proposal([
    { op: 'add_component', ref: 'cache', type: 'cache', name: 'Cache' },
    { op: 'add_component', ref: 'queue', type: 'queue', name: 'Queue' },
    { op: 'add_connection', ref: 'reads', source: 'api', target: 'cache', kind: 'sync' },
    { op: 'add_connection', ref: 'jobs', source: 'api', target: 'queue', kind: 'async' },
    { op: 'update_component', id: 'cache', name: 'Session Cache', properties: { engine: 'Redis' } },
    { op: 'update_connection', id: 'reads', label: 'sessions' },
    { op: 'remove_connection', id: 'jobs' },
    { op: 'remove_component', id: 'queue' },
  ]);

  it('applies updates and removals addressed by ref, as the server allows', () => {
    const { nodes, edges } = toFlow(doc);

    const result = fromFlow(...applyProposal(nodes, edges, p));

    expect(result.components.find((c) => c.id === 'p1-cache')).toMatchObject({
      name: 'Session Cache',
      properties: { engine: 'Redis' },
    });
    expect(result.components.map((c) => c.id)).not.toContain('p1-queue');
    expect(result.connections.find((c) => c.id === 'p1-reads')?.label).toBe('sessions');
    expect(result.connections.map((c) => c.id)).not.toContain('p1-jobs');
  });

  it('is not stale', () => {
    const { nodes, edges } = toFlow(doc);

    expect(staleReason(nodes, edges, p)).toBeNull();
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

  it('describes requirement, decision and experience changes', () => {
    const changes: Proposal['changes'] = [
      { op: 'set_experience_level', level: 'beginner' },
      {
        op: 'add_requirement',
        ref: 'reads',
        category: 'performance',
        statement: 'Reads outnumber writes 100 to 1',
      },
      { op: 'add_component', ref: 'cache', type: 'cache', name: 'Fake Cache' },
      { op: 'add_connection', ref: 'api-cache', source: 'api', target: 'cache', kind: 'sync' },
      {
        op: 'add_decision',
        title: 'Cache reads',
        rationale: 'r',
        targets: ['cache', 'api-cache'],
        requirements: ['reads'],
      },
      { op: 'update_requirement', id: 'R1', statement: '20k rps' },
      { op: 'remove_requirement', id: 'R2' },
    ];

    expect(changes.map((c) => describeChange(c, { api: 'API' }, changes))).toEqual([
      'Set your experience level to Beginner',
      'Note requirement (Performance): Reads outnumber writes 100 to 1',
      'Add Cache “Fake Cache”',
      'Connect API → Fake Cache (sync)',
      'Record decision “Cache reads” on Fake Cache, API → Fake Cache',
      'Update R1 (20k rps)',
      'Remove requirement R2',
    ]);
  });

  it('gives a new connection with a ref an id the server agrees on', () => {
    const { nodes, edges } = toFlow(doc);
    const p = proposal([
      { op: 'add_connection', ref: 'api-db', source: 'db', target: 'api', kind: 'async' },
    ]);

    const [, applied] = applyProposal(nodes, edges, p);

    expect(applied.map((e) => e.id)).toContain('p1-api-db');
  });
});
