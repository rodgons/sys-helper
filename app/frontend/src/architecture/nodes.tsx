import * as stylex from '@stylexjs/stylex';
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  Handle,
  type NodeProps,
  Position,
} from '@xyflow/react';
import { color, font, radius, space, text } from '../design/tokens.stylex';
import { type ComponentNode, type ConnectionEdge, typeDef } from './model';

/** A Component on the canvas: its type as a caption, its name, and a summary of its properties. */
export function ComponentNodeView({ data, selected }: NodeProps<ComponentNode>) {
  const summary = typeDef(data.type)
    .properties.map((p) => data.properties[p.key])
    .filter(Boolean)
    .join(' · ');
  return (
    <div {...stylex.props(styles.node, selected && styles.selected)}>
      <Handle type="target" position={Position.Left} {...stylex.props(styles.handle)} />
      <span {...stylex.props(styles.type)}>{typeDef(data.type).label}</span>
      <span {...stylex.props(styles.name)}>{data.name}</span>
      {summary && <span {...stylex.props(styles.summary)}>{summary}</span>}
      <Handle type="source" position={Position.Right} {...stylex.props(styles.handle)} />
    </div>
  );
}

const DASH = { sync: undefined, async: '6 4', replication: '2 4' } as const;

/** A Connection: solid for sync requests, dashed for async messages, dotted for replication. */
export function ConnectionEdgeView({
  id,
  data,
  selected,
  markerEnd,
  ...geometry
}: EdgeProps<ConnectionEdge>) {
  const [path, labelX, labelY] = getBezierPath(geometry);
  const kind = data?.kind ?? 'sync';
  const label = [kind === 'sync' ? '' : kind, data?.label].filter(Boolean).join(' · ');
  const labelProps = stylex.props(styles.edgeLabel, styles.at(labelX, labelY));
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          strokeDasharray: DASH[kind],
          stroke: selected ? color['--color-accent'] : color['--color-line-strong'],
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          {/* nodrag/nopan: React Flow's classes that keep the label from dragging the canvas. */}
          <span className={`${labelProps.className ?? ''} nodrag nopan`} style={labelProps.style}>
            {label}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const nodeTypes = { component: ComponentNodeView };
export const edgeTypes = { connection: ConnectionEdgeView };

const styles = stylex.create({
  node: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 150,
    maxWidth: 220,
    paddingInline: space['--space-3'],
    paddingBlock: space['--space-2'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line-strong'],
    borderRadius: radius['--radius-md'],
    backgroundColor: color['--color-surface'],
    color: color['--color-fg'],
  },
  selected: {
    borderColor: color['--color-accent'],
    boxShadow: `0 0 0 3px ${color['--color-accent-soft']}`,
  },
  type: {
    fontFamily: font['--font-mono'],
    fontSize: '0.625rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: color['--color-accent-strong'],
  },
  name: { fontSize: text['--text-sm'], fontWeight: 600, overflowWrap: 'anywhere' },
  summary: { fontSize: text['--text-xs'], color: color['--color-fg-muted'] },
  handle: {
    width: 8,
    height: 8,
    backgroundColor: color['--color-surface'],
    borderColor: color['--color-line-strong'],
  },
  edgeLabel: {
    position: 'absolute',
    pointerEvents: 'all',
    paddingInline: space['--space-2'],
    paddingBlock: 2,
    borderRadius: radius['--radius-sm'],
    backgroundColor: color['--color-canvas'],
    fontFamily: font['--font-mono'],
    fontSize: text['--text-xs'],
    color: color['--color-fg-muted'],
  },
  at: (x: number, y: number) => ({ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }),
});
