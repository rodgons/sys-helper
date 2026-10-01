import { Graph, layout } from '@dagrejs/dagre';
import type { ComponentNode, ConnectionEdge } from './model';

type XY = { x: number; y: number };

// A component's size before React Flow has measured it.
const SIZE = { width: 180, height: 70 };

/** Lays the whole graph out left to right with dagre, returning each component's top-left corner. */
export function dagreLayout(nodes: ComponentNode[], edges: ConnectionEdge[]): Map<string, XY> {
  const g = new Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) {
    g.setNode(n.id, {
      width: n.measured?.width ?? SIZE.width,
      height: n.measured?.height ?? SIZE.height,
    });
  }
  for (const e of edges) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  }
  layout(g);

  const corners = new Map<string, XY>();
  for (const n of nodes) {
    const { x, y, width, height } = g.node(n.id);
    corners.set(n.id, { x: x - width / 2, y: y - height / 2 });
  }
  return corners;
}

/**
 * Rearranges every component with dagre so connections flow left to right. The drawing keeps its
 * top-left corner, so it stays roughly where the User had it.
 */
export function tidy(nodes: ComponentNode[], edges: ConnectionEdge[]): ComponentNode[] {
  if (nodes.length === 0) return nodes;
  const corners = dagreLayout(nodes, edges);
  const laidOut = [...corners.values()];
  const shift = {
    x: Math.min(...nodes.map((n) => n.position.x)) - Math.min(...laidOut.map((p) => p.x)),
    y: Math.min(...nodes.map((n) => n.position.y)) - Math.min(...laidOut.map((p) => p.y)),
  };
  return nodes.map((n) => {
    const p = corners.get(n.id) ?? n.position;
    return { ...n, position: { x: Math.round(p.x + shift.x), y: Math.round(p.y + shift.y) } };
  });
}
