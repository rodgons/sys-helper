import { describe, expect, it } from 'vitest';
import {
  type ArchitectureDocument,
  COMPONENT_TYPES,
  freeSpot,
  fromFlow,
  newComponentNode,
  newConnectionEdge,
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
