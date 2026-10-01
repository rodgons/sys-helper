import { Graph, layout } from '@dagrejs/dagre';
import {
  type ComponentNode,
  type ConnectionEdge,
  type ConnectionKind,
  type Diff,
  freeSpot,
  typeDef,
} from './model';

// The shapes the API sends; see internal/proposal and internal/conversation in the backend.
export type ProposalChange = {
  op:
    | 'add_component'
    | 'update_component'
    | 'remove_component'
    | 'add_connection'
    | 'update_connection'
    | 'remove_connection';
  id?: string;
  ref?: string;
  type?: string;
  name?: string;
  properties?: Record<string, string>;
  source?: string;
  target?: string;
  kind?: ConnectionKind;
  label?: string;
};

export type Proposal = {
  seq: number;
  summary: string;
  changes: ProposalChange[];
  status: 'pending' | 'accepted' | 'rejected' | 'superseded';
  baseVersion: number;
};

/** Ids new items get once applied. Stable per Proposal, so the preview and the result match. */
const componentId = (p: Proposal, ref: string) => `p${p.seq}-${ref}`;
const connectionId = (p: Proposal, index: number) => `p${p.seq}-k${index}`;

/**
 * Why the Proposal can no longer be applied: it refers to a component or connection the User has
 * since removed. Null while it still applies.
 */
export function staleReason(
  nodes: ComponentNode[],
  edges: ConnectionEdge[],
  p: Proposal,
): string | null {
  const components = new Set(nodes.map((n) => n.id));
  const connections = new Set(edges.map((e) => e.id));
  const refs = new Set(
    p.changes.flatMap((c) => (c.op === 'add_component' && c.ref ? [c.ref] : [])),
  );
  const missing = (c: ProposalChange): string[] => {
    switch (c.op) {
      case 'add_component':
        return [];
      case 'update_component':
      case 'remove_component':
        return components.has(c.id ?? '') ? [] : [c.id ?? ''];
      case 'add_connection':
        return [c.source ?? '', c.target ?? ''].filter(
          (id) => !refs.has(id) && !components.has(id),
        );
      case 'update_connection':
      case 'remove_connection':
        return connections.has(c.id ?? '') ? [] : [c.id ?? ''];
    }
  };
  for (const c of p.changes) {
    const gone = missing(c);
    if (gone.length > 0) return `“${gone.join('”, “')}” is no longer on the canvas`;
  }
  return null;
}

/**
 * The canvas with the Proposal applied. New components are placed by dagre relative to the
 * existing layout, which stays untouched, unless `positions` already fixes where they go (so the
 * result matches the preview the User reviewed). Call only when staleReason is null.
 */
export function applyProposal(
  nodes: ComponentNode[],
  edges: ConnectionEdge[],
  p: Proposal,
  positions: Record<string, XY> = {},
): [ComponentNode[], ConnectionEdge[]] {
  let nextNodes = nodes.map((n) => ({
    ...n,
    data: { ...n.data, properties: { ...n.data.properties } },
  }));
  let nextEdges = edges.map((e) => ({ ...e, data: e.data && { ...e.data } }));
  const resolve = (idOrRef = '') =>
    p.changes.some((c) => c.op === 'add_component' && c.ref === idOrRef)
      ? componentId(p, idOrRef)
      : idOrRef;
  const added: ComponentNode[] = [];

  p.changes.forEach((c, i) => {
    switch (c.op) {
      case 'add_component': {
        const node: ComponentNode = {
          id: componentId(p, c.ref ?? String(i)),
          type: 'component',
          position: { x: 0, y: 0 },
          data: {
            type: c.type ?? 'custom',
            name: c.name ?? typeDef(c.type ?? '').label,
            properties: { ...c.properties },
          },
        };
        added.push(node);
        nextNodes.push(node);
        break;
      }
      case 'update_component':
        for (const n of nextNodes) {
          if (n.id !== c.id) continue;
          if (c.name !== undefined) n.data.name = c.name;
          Object.assign(n.data.properties, c.properties);
        }
        break;
      case 'remove_component':
        nextNodes = nextNodes.filter((n) => n.id !== c.id);
        nextEdges = nextEdges.filter((e) => e.source !== c.id && e.target !== c.id);
        break;
      case 'add_connection':
        nextEdges.push({
          id: connectionId(p, i),
          type: 'connection',
          source: resolve(c.source),
          target: resolve(c.target),
          data: { kind: c.kind ?? 'sync', label: c.label ?? '' },
        });
        break;
      case 'update_connection':
        for (const e of nextEdges) {
          if (e.id !== c.id || !e.data) continue;
          if (c.kind) e.data.kind = c.kind;
          if (c.label !== undefined) e.data.label = c.label;
        }
        break;
      case 'remove_connection':
        nextEdges = nextEdges.filter((e) => e.id !== c.id);
        break;
    }
  });

  const fixed = added.filter((n) => positions[n.id]);
  for (const n of fixed) n.position = positions[n.id] as XY;
  place(
    added.filter((n) => !positions[n.id]),
    nextNodes,
    nextEdges,
  );
  return [nextNodes, nextEdges];
}

/**
 * What the canvas shows while the Proposal is pending: the result of applying it, with added and
 * changed items marked, plus the removed ones kept and marked so the User sees them go.
 */
export function previewProposal(
  nodes: ComponentNode[],
  edges: ConnectionEdge[],
  p: Proposal,
  positions: Record<string, XY> = {},
) {
  const [applied, appliedEdges] = applyProposal(nodes, edges, p, positions);
  const changed = new Set(p.changes.filter((c) => c.op.startsWith('update_')).map((c) => c.id));
  const before = new Set(nodes.map((n) => n.id));
  const beforeEdges = new Set(edges.map((e) => e.id));
  const after = new Set(applied.map((n) => n.id));
  const afterEdges = new Set(appliedEdges.map((e) => e.id));
  const mark = (id: string, existed: boolean): Diff | undefined =>
    !existed ? 'added' : changed.has(id) ? 'changed' : undefined;

  return {
    nodes: [
      ...applied.map((n) => ({ ...n, data: { ...n.data, diff: mark(n.id, before.has(n.id)) } })),
      ...nodes
        .filter((n) => !after.has(n.id))
        .map((n) => ({ ...n, data: { ...n.data, diff: 'removed' as const } })),
    ],
    edges: [
      ...appliedEdges.map((e) => ({
        ...e,
        data: e.data && { ...e.data, diff: mark(e.id, beforeEdges.has(e.id)) },
      })),
      ...edges
        .filter((e) => !afterEdges.has(e.id))
        .map((e) => ({ ...e, data: e.data && { ...e.data, diff: 'removed' as const } })),
    ],
  };
}

/** One change in words, e.g. "Connect API → Session Cache (sync, reads)". */
export function describeChange(
  c: ProposalChange,
  names: Record<string, string>,
  all: ProposalChange[],
): string {
  const name = (idOrRef = '') =>
    names[idOrRef] ??
    all.find((o) => o.op === 'add_component' && o.ref === idOrRef)?.name ??
    idOrRef;
  const props = (p?: Record<string, string>) =>
    Object.entries(p ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
  const details = (...parts: (string | undefined)[]) => {
    const text = parts.filter(Boolean).join(', ');
    return text ? ` (${text})` : '';
  };
  switch (c.op) {
    case 'add_component':
      return `Add ${typeDef(c.type ?? '').label} “${c.name}”${details(props(c.properties))}`;
    case 'update_component':
      return `Update ${name(c.id)}${details(c.name !== undefined ? `name: ${c.name}` : '', props(c.properties))}`;
    case 'remove_component':
      return `Remove ${name(c.id)}`;
    case 'add_connection':
      return `Connect ${name(c.source)} → ${name(c.target)}${details(c.kind, c.label)}`;
    case 'update_connection':
      return `Update connection ${name(c.id)}${details(c.kind && `kind: ${c.kind}`, c.label !== undefined ? `label: ${c.label}` : '')}`;
    case 'remove_connection':
      return `Remove connection ${name(c.id)}`;
  }
}

type XY = { x: number; y: number };

const SIZE = { width: 180, height: 70 };

/**
 * Positions `added` (already in `nodes`) with dagre: lay out the whole graph left to right, shift
 * the result so existing components line up with where they really are, then nudge each new
 * component to free space. Existing components never move.
 */
function place(added: ComponentNode[], nodes: ComponentNode[], edges: ConnectionEdge[]) {
  if (added.length === 0) return;
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

  // Existing components, and new ones whose position is already fixed, stay where they are.
  const isNew = new Set(added.map((n) => n.id));
  const existing = nodes.filter((n) => !isNew.has(n.id));
  const topLeft = (id: string) => {
    const { x, y, width, height } = g.node(id);
    return { x: x - width / 2, y: y - height / 2 };
  };
  // Average offset between dagre's layout and the real one (none on an empty canvas).
  const offset = { x: 80, y: 80 };
  if (existing.length > 0) {
    offset.x =
      existing.reduce((sum, n) => sum + n.position.x - topLeft(n.id).x, 0) / existing.length;
    offset.y =
      existing.reduce((sum, n) => sum + n.position.y - topLeft(n.id).y, 0) / existing.length;
  }
  const placed = [...existing];
  for (const n of added) {
    const p = topLeft(n.id);
    n.position = freeSpot({ x: Math.round(p.x + offset.x), y: Math.round(p.y + offset.y) }, placed);
    placed.push(n);
  }
}
