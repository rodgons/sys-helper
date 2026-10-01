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
import { lookOf, SHAPES } from './shapes';

/**
 * A Component on the canvas, drawn in its type's shape (see shapes.tsx): its type as a caption with
 * an icon, its name, and a summary of its properties.
 */
export function ComponentNodeView({ data, selected, width, height }: NodeProps<ComponentNode>) {
  const summary = typeDef(data.type)
    .properties.map((p) => data.properties[p.key])
    .filter(Boolean)
    .join(' · ');
  const look = lookOf(data.type);
  const shape = SHAPES[look.shape];
  const Icon = look.icon;
  // Before React Flow measures the node, draw the outline at a typical size.
  const w = width ?? 180;
  const h = height ?? 64;
  const outline = shape.outline(w, h);
  const [insetLeft, insetRight] = shape.inset?.(w, h) ?? [0, 0];
  const stroke = [
    styles.stroke,
    selected && styles.strokeSelected,
    data.diff && diffStrokes[data.diff],
  ];
  return (
    <div
      data-shape={look.shape}
      data-diff={data.diff}
      {...stylex.props(
        styles.node,
        styles.pad(...shape.pad),
        data.diff === 'removed' && styles.faded,
      )}
    >
      <svg aria-hidden="true" {...stylex.props(styles.outline)}>
        {selected && <path d={outline} {...stylex.props(styles.halo)} />}
        <path d={outline} {...stylex.props(styles.fill, ...stroke)} />
        {shape.detail && <path d={shape.detail(w, h)} {...stylex.props(styles.rim, ...stroke)} />}
      </svg>
      <Handle
        type="target"
        position={Position.Left}
        style={{ left: insetLeft }}
        {...stylex.props(styles.handle)}
      />
      <span {...stylex.props(styles.type)}>
        <Icon size={12} strokeWidth={2.25} aria-hidden="true" />
        {typeDef(data.type).label}
        {data.diff && <span {...stylex.props(styles.diffTag)}> · {DIFF_LABEL[data.diff]}</span>}
      </span>
      <span {...stylex.props(styles.name, data.diff === 'removed' && styles.struck)}>
        {data.name}
      </span>
      {summary && <span {...stylex.props(styles.summary)}>{summary}</span>}
      {data.decisions ? (
        <span {...stylex.props(styles.badge, data.needsReview && styles.badgeReview)}>
          {data.decisions} {data.decisions === 1 ? 'decision' : 'decisions'}
          {data.needsReview && ' · needs review'}
        </span>
      ) : null}
      <Handle
        type="source"
        position={Position.Right}
        style={{ right: insetRight }}
        {...stylex.props(styles.handle)}
      />
    </div>
  );
}

const DIFF_LABEL = { added: 'new', changed: 'changed', removed: 'removed' } as const;
const DIFF_STROKE = {
  added: color['--color-success'],
  changed: color['--color-warning'],
  removed: color['--color-danger'],
} as const;

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
          stroke: data?.diff
            ? DIFF_STROKE[data.diff]
            : selected
              ? color['--color-accent']
              : color['--color-line-strong'],
          strokeWidth: selected || data?.diff ? 2 : 1.5,
          opacity: data?.diff === 'removed' ? 0.5 : 1,
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
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 150,
    maxWidth: 240,
    color: color['--color-fg'],
  },
  pad: (top: number, right: number, bottom: number, left: number) => ({
    paddingTop: top,
    paddingRight: right,
    paddingBottom: bottom,
    paddingLeft: left,
  }),
  faded: { opacity: 0.5 },
  outline: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: 'none',
  },
  fill: { fill: color['--color-surface'] },
  rim: { fill: 'none' },
  stroke: { stroke: color['--color-line-strong'], strokeWidth: 1, strokeLinejoin: 'round' },
  strokeSelected: { stroke: color['--color-accent'], strokeWidth: 2 },
  halo: { fill: 'none', stroke: color['--color-accent-soft'], strokeWidth: 7 },
  diffTag: { fontWeight: 700 },
  badge: {
    position: 'relative',
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingInline: space['--space-2'],
    borderRadius: radius['--radius-full'],
    backgroundColor: color['--color-accent-soft'],
    fontFamily: font['--font-mono'],
    fontSize: '0.625rem',
    color: color['--color-accent-strong'],
  },
  badgeReview: { backgroundColor: color['--color-subtle'], color: color['--color-warning'] },
  struck: { textDecorationLine: 'line-through' },
  type: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontFamily: font['--font-mono'],
    fontSize: '0.625rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: color['--color-accent-strong'],
  },
  name: {
    position: 'relative',
    fontSize: text['--text-sm'],
    fontWeight: 600,
    overflowWrap: 'anywhere',
  },
  summary: { position: 'relative', fontSize: text['--text-xs'], color: color['--color-fg-muted'] },
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

// Proposal preview: green dashed for new, amber for changed, red for removed (faded as a whole).
const diffStrokes = stylex.create({
  added: { stroke: color['--color-success'], strokeWidth: 2, strokeDasharray: '6 4' },
  changed: { stroke: color['--color-warning'], strokeWidth: 2 },
  removed: { stroke: color['--color-danger'] },
});
