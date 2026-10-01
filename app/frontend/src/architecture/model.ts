import type { Edge, Node } from '@xyflow/react';

// Keep COMPONENT_TYPES and CONNECTION_KINDS in sync with the Go catalog in
// app/backend/internal/architecture/document.go; the API rejects anything else.

export type ConnectionKind = 'sync' | 'async' | 'replication';

export type ComponentTypeDef = {
  type: string;
  label: string;
  properties: { key: string; label: string; placeholder: string }[];
};

export const COMPONENT_TYPES: ComponentTypeDef[] = [
  {
    type: 'client',
    label: 'Client',
    properties: [{ key: 'platform', label: 'Platform', placeholder: 'Web, iOS, Android' }],
  },
  { type: 'dns', label: 'DNS', properties: [] },
  { type: 'cdn', label: 'CDN', properties: [] },
  {
    type: 'load_balancer',
    label: 'Load Balancer',
    properties: [{ key: 'algorithm', label: 'Algorithm', placeholder: 'Round robin' }],
  },
  { type: 'api_gateway', label: 'API Gateway', properties: [] },
  {
    type: 'service',
    label: 'Service',
    properties: [
      { key: 'runtime', label: 'Runtime', placeholder: 'Go, Node.js' },
      { key: 'instances', label: 'Instances', placeholder: '3, autoscaled' },
    ],
  },
  {
    type: 'database',
    label: 'Database',
    properties: [
      { key: 'engine', label: 'Engine', placeholder: 'PostgreSQL' },
      { key: 'replicas', label: 'Replicas', placeholder: '2 read replicas' },
      { key: 'sharding', label: 'Sharding', placeholder: 'By user ID' },
    ],
  },
  {
    type: 'cache',
    label: 'Cache',
    properties: [
      { key: 'engine', label: 'Engine', placeholder: 'Redis' },
      { key: 'eviction', label: 'Eviction', placeholder: 'LRU' },
    ],
  },
  {
    type: 'queue',
    label: 'Queue / Stream',
    properties: [
      { key: 'engine', label: 'Engine', placeholder: 'Kafka, SQS' },
      { key: 'delivery', label: 'Delivery', placeholder: 'At least once' },
    ],
  },
  { type: 'object_store', label: 'Object Store', properties: [] },
  {
    type: 'search_index',
    label: 'Search Index',
    properties: [{ key: 'engine', label: 'Engine', placeholder: 'Elasticsearch' }],
  },
  {
    type: 'external_service',
    label: 'External Service',
    properties: [{ key: 'provider', label: 'Provider', placeholder: 'Stripe' }],
  },
  {
    type: 'custom',
    label: 'Custom',
    properties: [
      { key: 'description', label: 'What it is', placeholder: 'Describe this component' },
    ],
  },
];

export const CONNECTION_KINDS: { kind: ConnectionKind; label: string }[] = [
  { kind: 'sync', label: 'Sync request' },
  { kind: 'async', label: 'Async message' },
  { kind: 'replication', label: 'Replication' },
];

export const typeDef = (type: string) =>
  COMPONENT_TYPES.find((t) => t.type === type) ?? (COMPONENT_TYPES.at(-1) as ComponentTypeDef);

/** The saved shape of an Architecture, as the API stores it. */
export type ArchitectureDocument = {
  components: {
    id: string;
    type: string;
    name: string;
    position: { x: number; y: number };
    properties?: Record<string, string>;
  }[];
  connections: {
    id: string;
    source: string;
    target: string;
    kind: ConnectionKind;
    label?: string;
  }[];
};

/** How a pending Proposal would change an item; only set on the canvas preview, never saved. */
export type Diff = 'added' | 'changed' | 'removed';

export type ComponentData = {
  type: string;
  name: string;
  properties: Record<string, string>;
  // Display only, never saved: the Proposal preview marker and the Decision badge.
  diff?: Diff;
  decisions?: number;
  needsReview?: boolean;
};
export type ConnectionData = { kind: ConnectionKind; label: string; diff?: Diff };
export type ComponentNode = Node<ComponentData, 'component'>;
export type ConnectionEdge = Edge<ConnectionData, 'connection'>;

export function toFlow(doc: ArchitectureDocument): {
  nodes: ComponentNode[];
  edges: ConnectionEdge[];
} {
  return {
    nodes: doc.components.map((c) => ({
      id: c.id,
      type: 'component',
      position: c.position,
      data: { type: c.type, name: c.name, properties: c.properties ?? {} },
    })),
    edges: doc.connections.map((c) => ({
      id: c.id,
      type: 'connection',
      source: c.source,
      target: c.target,
      data: { kind: c.kind, label: c.label ?? '' },
    })),
  };
}

export function fromFlow(nodes: ComponentNode[], edges: ConnectionEdge[]): ArchitectureDocument {
  return {
    components: nodes.map((n) => {
      const properties = Object.fromEntries(
        Object.entries(n.data.properties).filter(([, v]) => v.trim() !== ''),
      );
      return {
        id: n.id,
        type: n.data.type,
        // A name being edited can be blank for a moment; save the type's label instead.
        name: n.data.name.trim() || typeDef(n.data.type).label,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        ...(Object.keys(properties).length > 0 && { properties }),
      };
    }),
    connections: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      kind: e.data?.kind ?? 'sync',
      ...(e.data?.label && { label: e.data.label }),
    })),
  };
}

const newId = () => crypto.randomUUID().slice(0, 8);

/** A new Component of `type`, named after the type ("Database", then "Database 2", …). */
export function newComponentNode(
  type: string,
  position: { x: number; y: number },
  existing: ComponentNode[],
): ComponentNode {
  const label = typeDef(type).label;
  const taken = new Set(existing.map((n) => n.data.name));
  let name = label;
  for (let i = 2; taken.has(name); i++) name = `${label} ${i}`;
  return { id: `c-${newId()}`, type: 'component', position, data: { type, name, properties: {} } };
}

// Room a Component takes on the canvas, including a gap, for placement purposes.
const SLOT = { width: 260, height: 110 };

/**
 * The position nearest to `wanted` where a new Component won't overlap existing ones: tries
 * `wanted`, then steps down and to the right, row by row.
 */
export function freeSpot(wanted: { x: number; y: number }, nodes: ComponentNode[]) {
  const overlaps = (x: number, y: number) =>
    nodes.some((n) => {
      const w = Math.max(n.measured?.width ?? 0, SLOT.width - 20) + 20;
      const h = Math.max(n.measured?.height ?? 0, SLOT.height - 20) + 20;
      return (
        x < n.position.x + w &&
        n.position.x < x + SLOT.width &&
        y < n.position.y + h &&
        n.position.y < y + SLOT.height
      );
    });
  for (let row = 0; row < 20; row++) {
    for (let col = 0; col < 4; col++) {
      const x = wanted.x + col * SLOT.width;
      const y = wanted.y + row * SLOT.height;
      if (!overlaps(x, y)) return { x, y };
    }
  }
  return wanted;
}

export function newConnectionEdge(source: string, target: string): ConnectionEdge {
  return {
    id: `k-${newId()}`,
    type: 'connection',
    source,
    target,
    data: { kind: 'sync', label: '' },
  };
}
