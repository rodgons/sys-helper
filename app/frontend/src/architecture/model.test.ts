import { describe, expect, it } from 'vitest';
import {
  type ArchitectureDocument,
  COMPONENT_TYPES,
  freeSpot,
  fromFlow,
  newComponentNode,
  newConnectionEdge,
  spotlight,
  toFlow,
} from './model';

const doc: ArchitectureDocument = {
  components: [
    { id: 'lb', type: 'load_balancer', name: 'Edge', position: { x: 0, y: 0 } },
    {
      id: 'db',
      type: 'database',
      name: 'Users',
      position: { x: 300, y: 40 },
      properties: { engine: 'PostgreSQL', replicas: '2' },
    },
  ],
  connections: [{ id: 'c1', source: 'lb', target: 'db', kind: 'async', label: 'events' }],
};

describe('architecture model', () => {
  it('round-trips a document through React Flow nodes and edges', () => {
    const { nodes, edges } = toFlow(doc);

    expect(nodes).toHaveLength(2);
    expect(edges[0]).toMatchObject({ source: 'lb', target: 'db' });
    expect(fromFlow(nodes, edges)).toEqual(doc);
  });

  it('drops empty properties and labels when serializing', () => {
    const { nodes, edges } = toFlow({
      components: [
        {
          id: 'a',
          type: 'cache',
          name: 'Cache',
          position: { x: 0, y: 0 },
          properties: { engine: '' },
        },
        { id: 'b', type: 'service', name: 'API', position: { x: 0, y: 0 } },
      ],
      connections: [{ id: 'c', source: 'b', target: 'a', kind: 'sync', label: '' }],
    });

    expect(fromFlow(nodes, edges)).toEqual({
      components: [
        { id: 'a', type: 'cache', name: 'Cache', position: { x: 0, y: 0 } },
        { id: 'b', type: 'service', name: 'API', position: { x: 0, y: 0 } },
      ],
      connections: [{ id: 'c', source: 'b', target: 'a', kind: 'sync' }],
    });
  });

  it('saves a blank name as the type label', () => {
    const { nodes, edges } = toFlow({
      components: [{ id: 'a', type: 'cache', name: '  ', position: { x: 0, y: 0 } }],
      connections: [],
    });

    expect(fromFlow(nodes, edges).components[0]?.name).toBe('Cache');
  });

  it('names new components after their type, numbering repeats', () => {
    const { nodes } = toFlow(doc);

    const first = newComponentNode('cache', { x: 10, y: 20 }, nodes);
    const second = newComponentNode('cache', { x: 0, y: 0 }, [...nodes, first]);

    expect(first.data).toMatchObject({ type: 'cache', name: 'Cache' });
    expect(first.position).toEqual({ x: 10, y: 20 });
    expect(second.data.name).toBe('Cache 2');
    expect(first.id).not.toBe(second.id);
  });

  it('places new components where they do not overlap existing ones', () => {
    const at = (x: number, y: number) => newComponentNode('service', { x, y }, []);
    const nodes = [at(0, 0), at(200, 0)];

    expect(freeSpot({ x: 500, y: 500 }, nodes)).toEqual({ x: 500, y: 500 });
    const spot = freeSpot({ x: 10, y: 10 }, nodes);
    for (const n of nodes) {
      const apart = Math.abs(spot.x - n.position.x) >= 180 || Math.abs(spot.y - n.position.y) >= 90;
      expect(apart).toBe(true);
    }
  });

  it('creates sync connections by default', () => {
    const edge = newConnectionEdge('lb', 'db');

    expect(edge).toMatchObject({ source: 'lb', target: 'db', data: { kind: 'sync', label: '' } });
  });

  it('has the catalog the API accepts', () => {
    expect(COMPONENT_TYPES.map((t) => t.type)).toEqual([
      'client',
      'dns',
      'cdn',
      'load_balancer',
      'api_gateway',
      'service',
      'database',
      'cache',
      'queue',
      'object_store',
      'search_index',
      'external_service',
      'custom',
    ]);
    expect(
      COMPONENT_TYPES.find((t) => t.type === 'database')?.properties.map((p) => p.key),
    ).toEqual(['engine', 'replicas', 'sharding']);
  });
});

describe('spotlight', () => {
  // client → lb → api → db, plus a cache the api reads from and nothing else touches.
  const chain = toFlow({
    components: ['client', 'lb', 'api', 'db', 'cache', 'lonely'].map((id) => ({
      id,
      type: 'service',
      name: id,
      position: { x: 0, y: 0 },
    })),
    connections: [
      { id: 'k1', source: 'client', target: 'lb', kind: 'sync' },
      { id: 'k2', source: 'lb', target: 'api', kind: 'sync' },
      { id: 'k3', source: 'api', target: 'db', kind: 'sync' },
      { id: 'k4', source: 'api', target: 'cache', kind: 'sync' },
    ],
  });
  const select = (...ids: string[]) => ({
    nodes: chain.nodes.map((n) => ({ ...n, selected: ids.includes(n.id) })),
    edges: chain.edges.map((e) => ({ ...e, selected: ids.includes(e.id) })),
  });
  const dimmed = ({ nodes, edges }: ReturnType<typeof spotlight>) =>
    [...nodes, ...edges].filter((i) => i.data?.dimmed).map((i) => i.id);

  it('leaves everything undimmed while nothing is selected', () => {
    const flow = select();

    expect(spotlight(flow.nodes, flow.edges)).toEqual(flow);
  });

  it('dims all but a selected component, its connections and their other ends', () => {
    const flow = select('lb');

    expect(dimmed(spotlight(flow.nodes, flow.edges))).toEqual([
      'db',
      'cache',
      'lonely',
      'k3',
      'k4',
    ]);
  });

  it('lights up around every selected component together', () => {
    const flow = select('client', 'db');

    expect(dimmed(spotlight(flow.nodes, flow.edges))).toEqual(['cache', 'lonely', 'k2', 'k4']);
  });

  it('dims all but a selected connection and its two ends', () => {
    const flow = select('k2');

    expect(dimmed(spotlight(flow.nodes, flow.edges))).toEqual([
      'client',
      'db',
      'cache',
      'lonely',
      'k1',
      'k3',
      'k4',
    ]);
  });

  it('dims everything else around a component with no connections', () => {
    const flow = select('lonely');

    expect(dimmed(spotlight(flow.nodes, flow.edges))).toEqual([
      'client',
      'lb',
      'api',
      'db',
      'cache',
      'k1',
      'k2',
      'k3',
      'k4',
    ]);
  });
});
