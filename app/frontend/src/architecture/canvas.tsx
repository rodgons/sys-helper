import '@xyflow/react/dist/style.css';
import * as stylex from '@stylexjs/stylex';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  ConnectionMode,
  Controls,
  type EdgeChange,
  MarkerType,
  type NodeChange,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { color, radius, space, text } from '../design/tokens.stylex';
import { ApiError, apiFetch } from '../lib/api';
import type { VersionedArchitecture } from '../lib/architecture';
import { useAuth } from '../lib/auth';
import { useRefreshMessages, useSetProposalStatus } from '../lib/conversation';
import { useKnowledge, useRefreshKnowledge } from '../lib/knowledge';
import { Button } from '../ui/button';
import { Label, Text } from '../ui/typography';
import { type SaveStatus, useAutosave } from './autosave';
import { ComponentDock, DRAG_TYPE } from './dock';
import { Inspector } from './inspector';
import {
  type ComponentData,
  type ComponentNode,
  type ConnectionData,
  type ConnectionEdge,
  freeSpot,
  fromFlow,
  newComponentNode,
  newConnectionEdge,
  toFlow,
} from './model';
import { edgeTypes, nodeTypes } from './nodes';
import { applyProposal, type Proposal, previewProposal, staleReason } from './proposal';
import type { Review } from './review';

type CanvasProps = {
  slug: string;
  initial: VersionedArchitecture;
  /** The pending Proposal, previewed as a diff until the User accepts or rejects it. */
  proposal?: Proposal;
  /** Receives the review state of the pending Proposal (null when there is none). */
  onReview?: (review: Review | null) => void;
  /** Receives the current names of components and connections, by id, whenever they change. */
  onNames?: (names: Record<string, string>) => void;
};

/** The editable Architecture canvas. Every change is autosaved; see useAutosave. */
export function ArchitectureCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

// Width of the inspector panel (16rem) plus its margins.
const INSPECTOR_SPACE = 300;

// Changes that alter the saved document. Selection, measuring and mid-drag moves don't.
const changesDocument = (c: NodeChange | EdgeChange) =>
  c.type === 'add' ||
  c.type === 'remove' ||
  c.type === 'replace' ||
  (c.type === 'position' && !c.dragging);

function Editor({ slug, initial, proposal, onReview, onNames }: CanvasProps) {
  const [flow, setFlow] = useState(() => toFlow(initial.document));
  // Fit a saved architecture into view on load. An empty canvas must not fit: React Flow would wait
  // for the first component added and then re-centre the view on it, under the inspector.
  const [fitOnLoad] = useState(initial.document.components.length > 0);
  const latest = useRef(flow);
  const refreshKnowledge = useRefreshKnowledge(slug);
  // A save can prune Decisions whose components are gone, so reload them after each one.
  const autosave = useAutosave(slug, initial.version, refreshKnowledge);
  const reactFlow = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const update = (nodes: ComponentNode[], edges: ConnectionEdge[], changed: boolean) => {
    latest.current = { nodes, edges };
    setFlow(latest.current);
    if (changed) autosave.schedule(fromFlow(nodes, edges));
  };
  const { nodes, edges } = flow;
  const review = useProposalReview({
    slug,
    proposal,
    onReview,
    nodes,
    edges,
    latest,
    autosave,
    update,
  });
  useEffect(() => onNames?.(review.names), [onNames, review.names]);

  // Badge each component with its Decisions; flag it when one needs review.
  const knowledge = useKnowledge(slug);
  const decorate = (n: ComponentNode): ComponentNode => {
    const ds = knowledge.data?.decisions.filter((d) => d.targets.includes(n.id)) ?? [];
    return ds.length === 0
      ? n
      : {
          ...n,
          data: { ...n.data, decisions: ds.length, needsReview: ds.some((d) => d.needsReview) },
        };
  };
  const base = review.preview ?? flow;
  const shown = { nodes: base.nodes.map(decorate), edges: base.edges };

  // Bring a new Proposal into view once its components have been measured.
  const fitted = useRef(0);
  const ghostsMeasured =
    review.preview?.nodes.every((n) => n.data.diff !== 'added' || n.measured) ?? false;
  useEffect(() => {
    if (!proposal || !ghostsMeasured || fitted.current === proposal.seq) return;
    fitted.current = proposal.seq;
    void reactFlow.fitView({ padding: 0.25, maxZoom: 1, duration: 300 });
  }, [proposal, ghostsMeasured, reactFlow]);
  const editorIds = new Set(nodes.map((n) => n.id));
  const editorEdgeIds = new Set(edges.map((e) => e.id));

  const onConnect = ({ source, target }: Connection) => {
    const duplicate = latest.current.edges.some((e) => e.source === source && e.target === target);
    if (source === target || duplicate) return;
    update(
      latest.current.nodes,
      [...latest.current.edges, newConnectionEdge(source, target)],
      true,
    );
  };

  /** Adds a Component centred on `at` (a screen point), or in free space mid-view without one. */
  const addComponent = (type: string, at?: XY) => {
    // Aim for the middle of the visible area left of the inspector, which floats over the right edge.
    const box = wrapper.current?.getBoundingClientRect();
    const center = reactFlow.screenToFlowPosition(
      at ?? {
        x: (box?.left ?? 0) + Math.max((box?.width ?? 0) - INSPECTOR_SPACE, 0) / 2,
        y: (box?.top ?? 0) + (box?.height ?? 0) / 2,
      },
    );
    const wanted = { x: center.x - 90, y: center.y - 32 };
    const position = at ? wanted : freeSpot(wanted, latest.current.nodes);
    const node = newComponentNode(type, position, latest.current.nodes);
    update(
      [
        ...latest.current.nodes.map((n) => ({ ...n, selected: false })),
        { ...node, selected: true },
      ],
      latest.current.edges.map((e) => ({ ...e, selected: false })),
      true,
    );
  };

  const editComponent = (id: string, patch: Partial<ComponentData>) =>
    update(
      latest.current.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      latest.current.edges,
      true,
    );

  const editConnection = (id: string, patch: Partial<ConnectionData>) =>
    update(
      latest.current.nodes,
      latest.current.edges.map((e) =>
        e.id === id ? { ...e, data: { ...(e.data as ConnectionData), ...patch } } : e,
      ),
      true,
    );

  const remove = (id: string) =>
    update(
      latest.current.nodes.filter((n) => n.id !== id),
      latest.current.edges.filter((e) => e.id !== id && e.source !== id && e.target !== id),
      true,
    );

  return (
    <div ref={wrapper} {...stylex.props(styles.wrapper)}>
      <ReactFlow<ComponentNode, ConnectionEdge>
        nodes={shown.nodes}
        edges={shown.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={(all) => {
          // Changes to preview-only components just record their size, so they can be shown.
          review.measureGhosts(all);
          const changes = all.filter((c) => !('id' in c) || editorIds.has(c.id));
          if (changes.length === 0) return;
          update(
            applyNodeChanges(changes, latest.current.nodes),
            latest.current.edges,
            changes.some(changesDocument),
          );
        }}
        onEdgesChange={(all) => {
          const changes = all.filter((c) => !('id' in c) || editorEdgeIds.has(c.id));
          if (changes.length === 0) return;
          update(
            latest.current.nodes,
            applyEdgeChanges(changes, latest.current.edges),
            changes.some(changesDocument),
          );
        }}
        onConnect={onConnect}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={(e) => {
          const type = e.dataTransfer.getData(DRAG_TYPE);
          if (!type) return;
          e.preventDefault();
          addComponent(type, { x: e.clientX, y: e.clientY });
        }}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
        colorMode="system"
        fitView={fitOnLoad}
        fitViewOptions={{ maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
        <Panel position="top-left">
          <SaveIndicator status={autosave.status} />
        </Panel>
        <Panel position="top-right">
          <Inspector
            slug={slug}
            saved={autosave.status === 'saved'}
            nodes={nodes.filter((n) => n.selected)}
            edges={edges.filter((e) => e.selected)}
            onEditComponent={editComponent}
            onEditConnection={editConnection}
            onRemove={remove}
          />
        </Panel>
        <Panel position="bottom-center">
          <div {...stylex.props(styles.bottom)}>
            {proposal && <ProposalBar proposal={proposal} review={review.state} />}
            {autosave.status === 'conflict' && (
              <div role="alert" {...stylex.props(styles.conflict)}>
                <Text size="sm">
                  This architecture changed in another tab or window, so edits here are no longer
                  saved. Reload to continue from the latest version.
                </Text>
                <Button size="sm" onClick={() => window.location.reload()}>
                  Reload
                </Button>
              </div>
            )}
            <ComponentDock onAdd={(type) => addComponent(type)} />
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

type Flow = { nodes: ComponentNode[]; edges: ConnectionEdge[] };
type XY = { x: number; y: number };

/**
 * Previews the pending Proposal on the canvas and accepts or rejects it. Accepting applies it to
 * the canvas, placing new components where the preview showed them, and saves the result together
 * with resolving the Proposal (autosave.commit), so the canvas and the Proposal never disagree.
 */
function useProposalReview({
  slug,
  proposal,
  onReview,
  nodes,
  edges,
  latest,
  autosave,
  update,
}: {
  slug: string;
  proposal?: Proposal;
  onReview?: (review: Review | null) => void;
  nodes: ComponentNode[];
  edges: ConnectionEdge[];
  latest: { current: Flow };
  autosave: ReturnType<typeof useAutosave>;
  update: (nodes: ComponentNode[], edges: ConnectionEdge[], changed: boolean) => void;
}) {
  const auth = useAuth();
  const token = auth.status === 'signedIn' ? auth.token : undefined;
  const setStatus = useSetProposalStatus(slug);
  const refreshKnowledge = useRefreshKnowledge(slug);
  const refreshMessages = useRefreshMessages(slug);
  const [progress, setProgress] = useState<{ busy: boolean; error: string | null }>({
    busy: false,
    error: null,
  });
  const [ghostSizes, setGhostSizes] = useState<Record<string, { width: number; height: number }>>(
    {},
  );
  // Where the preview placed new components, per Proposal, so they don't move as the User edits
  // and land exactly there on accept.
  const placed = useRef<{ seq: number; at: Record<string, XY> }>({ seq: 0, at: {} });
  if (proposal && placed.current.seq !== proposal.seq)
    placed.current = { seq: proposal.seq, at: {} };

  const stale = useMemo(
    () => (proposal ? staleReason(nodes, edges, proposal) : null),
    [nodes, edges, proposal],
  );

  const preview = useMemo((): Flow | null => {
    if (!proposal || stale) return null;
    const p = previewProposal(nodes, edges, proposal, placed.current.at);
    return {
      nodes: p.nodes.map((n) => {
        if (n.data.diff !== 'added') return n;
        placed.current.at[n.id] ??= n.position;
        return {
          ...n,
          draggable: false,
          selectable: false,
          connectable: false,
          measured: ghostSizes[n.id],
        };
      }),
      edges: p.edges.map((e) => (e.data?.diff === 'added' ? { ...e, selectable: false } : e)),
    };
  }, [nodes, edges, proposal, stale, ghostSizes]);

  const measureGhosts = (changes: NodeChange<ComponentNode>[]) => {
    const sizes: Record<string, { width: number; height: number }> = {};
    for (const c of changes) {
      if (
        c.type === 'dimensions' &&
        c.dimensions &&
        preview?.nodes.some((n) => n.id === c.id && n.data.diff === 'added')
      ) {
        sizes[c.id] = c.dimensions;
      }
    }
    if (Object.keys(sizes).length > 0) setGhostSizes((s) => ({ ...s, ...sizes }));
  };

  const act = useRef({ accept: async () => {}, reject: async () => {} });
  act.current.accept = async () => {
    if (!proposal || stale) return;
    setProgress({ busy: true, error: null });
    const [n, e] = applyProposal(
      latest.current.nodes,
      latest.current.edges,
      proposal,
      placed.current.at,
    );
    try {
      await autosave.commit(fromFlow(n, e), async (version, document) => {
        const res = await apiFetch<{ version: number }>(
          `/api/projects/${slug}/proposals/${proposal.seq}/accept`,
          {
            token,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version, document }),
          },
        );
        return res.version;
      });
      update(n, e, false);
      setStatus(proposal.seq, 'accepted');
      void refreshKnowledge();
      setProgress({ busy: false, error: null });
    } catch (err) {
      setProgress({ busy: false, error: reviewError(err, refreshMessages) });
    }
  };
  act.current.reject = async () => {
    if (!proposal) return;
    setProgress({ busy: true, error: null });
    try {
      await apiFetch(`/api/projects/${slug}/proposals/${proposal.seq}/reject`, {
        token,
        method: 'POST',
      });
      setStatus(proposal.seq, 'rejected');
      setProgress({ busy: false, error: null });
    } catch (err) {
      setProgress({ busy: false, error: reviewError(err, refreshMessages) });
    }
  };
  const accept = useCallback(() => void act.current.accept(), []);
  const reject = useCallback(() => void act.current.reject(), []);

  // Names change rarely; key them so dragging components doesn't re-publish the review.
  const namesKey = JSON.stringify([
    nodes.map((n) => [n.id, n.data.name]),
    edges.map((e) => [e.id, e.source, e.target]),
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: recomputed when namesKey changes
  const names = useMemo(() => {
    const byId: Record<string, string> = {};
    for (const n of nodes) byId[n.id] = n.data.name;
    for (const e of edges)
      byId[e.id] = `${byId[e.source] ?? e.source} → ${byId[e.target] ?? e.target}`;
    return byId;
  }, [namesKey]);

  const state: Review | null = useMemo(
    () => (proposal ? { seq: proposal.seq, stale, ...progress, names, accept, reject } : null),
    [proposal, stale, progress, names, accept, reject],
  );
  useEffect(() => onReview?.(state), [onReview, state]);
  useEffect(() => () => onReview?.(null), [onReview]);

  return { preview, state, measureGhosts, names };
}

function reviewError(err: unknown, refreshMessages: () => void): string | null {
  const code = err instanceof ApiError ? err.code : undefined;
  if (code === 'conflict') return null; // the conflict notice explains it
  if (code === 'not_pending') {
    refreshMessages();
    return 'This proposal was already accepted or rejected elsewhere.';
  }
  return "Couldn't update the proposal. Try again.";
}

/** Floating summary of the pending Proposal with Accept and Reject. */
function ProposalBar({ proposal, review }: { proposal: Proposal; review: Review | null }) {
  return (
    <section aria-label="Proposal" {...stylex.props(styles.proposal)}>
      <div {...stylex.props(styles.proposalText)}>
        <Label tone="accent">AI proposal #{proposal.seq}</Label>
        <Text size="sm">{proposal.summary}</Text>
        {review?.stale && (
          <Text size="sm" tone="muted">
            Out of date: {review.stale}. Ask the AI to redo it.
          </Text>
        )}
        {review?.error && (
          <Text size="sm" tone="accent">
            {review.error}
          </Text>
        )}
      </div>
      <div {...stylex.props(styles.proposalActions)}>
        <Button
          size="sm"
          disabled={!review || review.busy || review.stale !== null}
          onClick={review?.accept}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!review || review.busy}
          onClick={review?.reject}
        >
          Reject
        </Button>
      </div>
    </section>
  );
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  conflict: 'Not saved',
  error: "Couldn't save. Retrying on your next change",
};

function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <output
      aria-live="polite"
      {...stylex.props(styles.status, status === 'error' && styles.statusError)}
    >
      {STATUS_TEXT[status]}
    </output>
  );
}

const styles = stylex.create({
  wrapper: { flexGrow: 1, minHeight: 0, position: 'relative' },
  status: { fontSize: text['--text-xs'], color: color['--color-fg-muted'] },
  statusError: { color: color['--color-danger'] },
  bottom: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space['--space-2'],
  },
  proposal: {
    display: 'flex',
    alignItems: 'center',
    gap: space['--space-4'],
    maxWidth: '36rem',
    padding: space['--space-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-accent'],
    borderRadius: radius['--radius-md'],
    backgroundColor: color['--color-surface'],
    boxShadow: `0 4px 16px ${color['--color-accent-soft']}`,
  },
  proposalText: { display: 'flex', flexDirection: 'column', gap: space['--space-1'], minWidth: 0 },
  proposalActions: { display: 'flex', gap: space['--space-2'], flexShrink: 0 },
  conflict: {
    display: 'flex',
    alignItems: 'center',
    gap: space['--space-3'],
    maxWidth: '36rem',
    padding: space['--space-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-warning'],
    borderRadius: radius['--radius-md'],
    backgroundColor: color['--color-surface'],
  },
});
