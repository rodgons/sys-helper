import { describe, expect, it } from 'vitest';
import { tidy } from './layout';
import { toFlow } from './model';

// A chain scattered in the wrong order: client → api → db, with db furthest left.
const { nodes, edges } = toFlow({
  components: [
    { id: 'db', type: 'database', name: 'DB', position: { x: 100, y: 500 } },
    { id: 'api', type: 'service', name: 'API', position: { x: 900, y: 40 } },
    { id: 'client', type: 'client', name: 'Client', position: { x: 400, y: 300 } },
  ],
  connections: [
    { id: 'c1', source: 'client', target: 'api', kind: 'sync' },
    { id: 'c2', source: 'api', target: 'db', kind: 'sync' },
  ],
});

const at = (ns: typeof nodes, id: string) => {
  const n = ns.find((n) => n.id === id);
  if (!n) throw new Error(`no node ${id}`);
  return n.position;
};

describe('tidy', () => {
  it('lays connected components out left to right, in flow order', () => {
    const tidied = tidy(nodes, edges);

    expect(at(tidied, 'client').x).toBeLessThan(at(tidied, 'api').x);
    expect(at(tidied, 'api').x).toBeLessThan(at(tidied, 'db').x);
    expect(at(tidied, 'client').y).toBe(at(tidied, 'api').y);
  });

  it('keeps the drawing where it was on the canvas', () => {
    const tidied = tidy(nodes, edges);

    expect(Math.min(...tidied.map((n) => n.position.x))).toBe(100);
    expect(Math.min(...tidied.map((n) => n.position.y))).toBe(40);
  });

  it('leaves the given components untouched', () => {
    tidy(nodes, edges);

    expect(at(nodes, 'db')).toEqual({ x: 100, y: 500 });
  });
});
