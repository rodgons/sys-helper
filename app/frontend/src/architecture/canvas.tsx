import '@xyflow/react/dist/style.css';
import * as stylex from '@stylexjs/stylex';
import {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  ConnectionMode,
  ControlButton,
  Controls,
  type EdgeChange,
  EdgeToolbar,
  MarkerType,
  type NodeChange,
  NodeToolbar,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { Workflow } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { color, radius, space, text } from '../design/tokens.stylex';
import { ApiError, apiFetch } from '../lib/api';
import type { VersionedArchitecture } from '../lib/architecture';
import { useToken } from '../lib/auth';
import { useRefreshMessages, useSetProposalStatus } from '../lib/conversation';
import { useKnowledge, useRefreshKnowledge } from '../lib/knowledge';
import { useThemeChoice } from '../lib/theme';
import { Button } from '../ui/button';
import { Label, Text } from '../ui/typography';
import { type SaveStatus, useAutosave } from './autosave';
import { ComponentDock, ComponentPicker, DRAG_TYPE } from './dock';
import { Inspector } from './inspector';
import { tidy } from './layout';
import {
  type ComponentData,
  type ComponentNode,
  type ConnectionData,
  type ConnectionEdge,
  freeSpot,
  fromFlow,
  newComponentNode,
  newConnectionEdge,
  spotlight,
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
  /** The compact layout's bottom sheet. Given it, the canvas works by touch; see CompactSheet. */
  sheet?: CompactSheet;
};

/**
 * Where the compact canvas shows its Inspector: inside the bottom sheet (`host`), in place of the
 * tab content, while `open`. The canvas asks to open it when one tap selects a Component or
 * Connection, and to close it on ✕, Esc, a tap on the empty canvas or once nothing is selected.
 */
export type CompactSheet = {
  host: HTMLElement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** The editable Architecture canvas. Every change is autosaved; see useAutosave. */
export function ArchitectureCanvas(props: CanvasProps) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

// Width of the inspector (16rem) plus its margins.
const INSPECTOR_SPACE = 300;
// How far a compact canvas zooms out, so Fit frames even a large Architecture.
const COMPACT_MIN_ZOOM = 0.25;

/**
 * How to fit the Architecture into view. Panels float over the canvas (the controls bottom left, the
 * dock and proposal bar bottom centre, the inspector top right, or beside the selected component),
 * so the fit keeps clear of them rather than of the canvas edges. The inspector is only wide while
 * something is selected.
 */
function fitOptions({
  inspector,
  proposal,
  compact,
}: {
  inspector: boolean;
  proposal: boolean;
  compact: boolean;
}) {
  // Compact: the Inspector is in the sheet, under the canvas, so only the controls, the save status
  // and the bottom bar (with the Proposal banner) float over it. Tune on a device.
  if (compact) {
    return {
      maxZoom: 1,
      minZoom: COMPACT_MIN_ZOOM,
      padding: { top: '16px', left: '16px', right: '16px', bottom: proposal ? '104px' : '64px' },
    } as const;
  }
  return {
    maxZoom: 1,
    padding: {
      top: '48px',
      left: '64px',
      right: inspector ? `${INSPECTOR_SPACE}px` : '64px',
      bottom: proposal ? '180px' : '80px',
    },
  } as const;
}

// Changes that alter the saved document. Selection, measuring and mid-drag moves don't.
const changesDocument = (c: NodeChange | EdgeChange) =>
  c.type === 'add' ||
  c.type === 'remove' ||
  c.type === 'replace' ||
  (c.type === 'position' && !c.dragging);

function Editor({ slug, initial, proposal: pending, onReview, onNames, sheet }: CanvasProps) {
  const compact = sheet !== undefined;
  // The Proposal this canvas just accepted. The cached Conversation marks it accepted a render
  // later; until then it still arrives as pending and must not be previewed on top of its result.
  const [acceptedSeq, setAcceptedSeq] = useState<number | null>(null);
  const proposal = pending?.seq === acceptedSeq ? undefined : pending;
  const [flow, setFlow] = useState(() => toFlow(initial.document));
  // Fit a saved architecture into view on load. An empty canvas must not fit: React Flow would wait
  // for the first component added and then re-centre the view on it, under the inspector.
  const [fitOnLoad] = useState(initial.document.components.length > 0);
  const latest = useRef(flow);
  const refreshKnowledge = useRefreshKnowledge(slug);
  // A save can prune Decisions whose components are gone, so reload them after each one.
  const autosave = useAutosave(slug, initial.version, refreshKnowledge);
  const reactFlow = useReactFlow();
  const theme = useThemeChoice();
  const wrapper = useRef<HTMLDivElement>(null);
  // Where the last connection was clicked, on the canvas, so its window opens there.
  const [clicked, setClicked] = useState<({ id: string } & XY) | null>(null);
  // The component whose window is open. A click selects a component; clicking it again opens it.
  const [opened, setOpened] = useState<string | null>(null);
  // The one component selected as of the last render, i.e. before the click being handled.
  const selectedBefore = useRef<string | null>(null);

  // Set while a Proposal is being accepted. The accept sends the canvas as it was when the User
  // clicked, so an edit made meanwhile would either be lost or, saved afterwards, undo the Proposal.
  const locked = useRef(false);
  const update = (nodes: ComponentNode[], edges: ConnectionEdge[], changed: boolean) => {
    if (changed && locked.current) return;
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
    locked,
    autosave,
    update,
    onAccepted: setAcceptedSeq,
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
  // Dim everything the selection doesn't touch, counting the preview's connections.
  const base = review.preview ?? flow;
  const shown = spotlight(base.nodes.map(decorate), base.edges);

  // Bring a new Proposal into view once its components have been measured.
  const fitted = useRef(0);
  const ghostsMeasured =
    review.preview?.nodes.every((n) => n.data.diff !== 'added' || n.measured) ?? false;
  useEffect(() => {
    if (!proposal || !ghostsMeasured || fitted.current === proposal.seq) return;
    fitted.current = proposal.seq;
    void reactFlow.fitView({
      ...fitOptions({ inspector: false, proposal: true, compact }),
      duration: 300,
    });
  }, [proposal, ghostsMeasured, reactFlow, compact]);
  const fit = fitOptions({
    inspector: nodes.some((n) => n.selected) || edges.some((e) => e.selected),
    proposal: Boolean(proposal),
    compact,
  });
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
        x: (box?.left ?? 0) + Math.max((box?.width ?? 0) - (compact ? 0 : INSPECTOR_SPACE), 0) / 2,
        y: (box?.top ?? 0) + (box?.height ?? 0) / 2,
      },
    );
    const wanted = { x: center.x - 90, y: center.y - 32 };
    const position = at ? wanted : freeSpot(wanted, latest.current.nodes);
    const node = newComponentNode(type, position, latest.current.nodes);
    // A new component opens straight away, to be named.
    setOpened(node.id);
    sheet?.onOpenChange(true);
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

  /** Rearranges every component so connections flow left to right, then brings it all into view. */
  const tidyUp = () => {
    update(tidy(latest.current.nodes, latest.current.edges), latest.current.edges, true);
    void reactFlow.fitView({ ...fit, duration: 300 });
  };

  const remove = (id: string) =>
    update(
      latest.current.nodes.filter((n) => n.id !== id),
      latest.current.edges.filter((e) => e.id !== id && e.source !== id && e.target !== id),
      true,
    );

  const deselect = () =>
    update(
      latest.current.nodes.map((n) => ({ ...n, selected: false })),
      latest.current.edges.map((e) => ({ ...e, selected: false })),
      false,
    );

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);
  // One selected component is edited in a window beside it once opened, which follows it as it is
  // dragged, and one clicked connection in a window where it was clicked; anything else in the
  // corner panel.
  const [only] = selectedNodes.length === 1 && selectedEdges.length === 0 ? selectedNodes : [];
  selectedBefore.current = only?.id ?? null;
  const floating = only && only.id === opened ? only : undefined;
  const [floatingEdge] =
    selectedNodes.length === 0 && selectedEdges.length === 1 ? selectedEdges : [];
  const edgeAnchor = floatingEdge && clicked?.id === floatingEdge.id ? clicked : null;
  const single = selectedNodes.length + selectedEdges.length === 1;
  const sheetInspector = sheet?.open && single;
  // The sheet's Inspector edits one item; once nothing (or several) is selected, it closes.
  useEffect(() => {
    if (sheet?.open && !single) sheet.onOpenChange(false);
  }, [sheet, single]);
  usePanIntoView(
    wrapper,
    (sheetInspector && (selectedNodes[0]?.id ?? selectedEdges[0]?.id)) || null,
  );
  const inspector = compact ? (
    <Inspector
      slug={slug}
      saved={autosave.status === 'saved'}
      nodes={selectedNodes}
      edges={selectedEdges}
      onEditComponent={editComponent}
      onEditConnection={editConnection}
      onRemove={remove}
      // Closing keeps the selection, and the spotlight on it.
      onClose={() => sheet?.onOpenChange(false)}
      inSheet
    />
  ) : (
    <Inspector
      slug={slug}
      saved={autosave.status === 'saved'}
      nodes={only && !floating ? [] : selectedNodes}
      edges={selectedEdges}
      hint={only && !floating ? 'Click it again to edit it.' : undefined}
      onEditComponent={editComponent}
      onEditConnection={editConnection}
      onRemove={remove}
      // Closing a component's window keeps it selected, and the spotlight on it.
      onClose={floating ? () => setOpened(null) : deselect}
    />
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
        // Compact: one tap selects and opens the Inspector in the sheet. Desktop: a click selects,
        // a second click opens the window beside the component.
        onNodeClick={(_, node) =>
          compact
            ? sheet.onOpenChange(true)
            : setOpened(selectedBefore.current === node.id ? node.id : null)
        }
        onPaneClick={() => (compact ? sheet.onOpenChange(false) : setOpened(null))}
        // Esc closes the component's window, then clears the selection and with it the spotlight.
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          if (compact && sheet.open) sheet.onOpenChange(false);
          else if (floating) setOpened(null);
          else deselect();
        }}
        onEdgeClick={(e, edge) =>
          compact
            ? sheet.onOpenChange(true)
            : setClicked({
                id: edge.id,
                ...reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
              })
        }
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
        // Read-only while a review is being sent; edits made then are dropped anyway (`locked`).
        // Compact: Components don't move under a finger, so one finger pans anywhere and two
        // pinch; there's no multi-select or box selection.
        nodesDraggable={!review.state?.busy && !compact}
        multiSelectionKeyCode={compact ? null : undefined}
        selectionKeyCode={compact ? null : undefined}
        minZoom={compact ? COMPACT_MIN_ZOOM : undefined}
        nodesConnectable={!review.state?.busy}
        deleteKeyCode={review.state?.busy ? null : 'Backspace'}
        defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
        colorMode={theme}
        fitView={fitOnLoad}
        fitViewOptions={fit}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
        <Controls
          showInteractive={false}
          showZoom={!compact}
          // Compact: one row beside "+ Add", clear of the Proposal banner above them.
          orientation={compact ? 'horizontal' : 'vertical'}
          fitViewOptions={fit}
        >
          <ControlButton
            onClick={tidyUp}
            // A pending Proposal's preview fixes where its new components go, so tidying under it
            // would leave them stranded.
            disabled={Boolean(proposal) || nodes.length < 2}
            aria-label="Tidy up"
            title={proposal ? 'Tidy up (after reviewing the proposal)' : 'Tidy up'}
          >
            <Workflow />
          </ControlButton>
        </Controls>
        <Panel position="top-left">
          <SaveIndicator status={autosave.status} />
        </Panel>
        {compact ? (
          sheetInspector && sheet.host && createPortal(inspector, sheet.host)
        ) : floating ? (
          <NodeToolbar
            nodeId={floating.id}
            isVisible
            position={Position.Right}
            align="start"
            offset={12}
            // Scrolling the inspector shouldn't zoom the canvas.
            className="nowheel"
          >
            {inspector}
          </NodeToolbar>
        ) : edgeAnchor ? (
          <EdgeToolbar
            edgeId={edgeAnchor.id}
            x={edgeAnchor.x}
            y={edgeAnchor.y}
            isVisible
            alignX="left"
            alignY="top"
            // It sits inside the canvas, so typing, dragging and scrolling in it must not pan or zoom.
            className="nowheel nopan nodrag"
          >
            <div {...stylex.props(styles.edgeWindow)}>{inspector}</div>
          </EdgeToolbar>
        ) : (
          <Panel position="top-right">{inspector}</Panel>
        )}
        <Panel position="bottom-center">
          <div {...stylex.props(styles.bottom)}>
            {proposal &&
              (compact ? (
                <CompactProposalBar proposal={proposal} review={review.state} />
              ) : (
                <ProposalBar proposal={proposal} review={review.state} />
              ))}
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
            {compact ? (
              <ComponentPicker onAdd={(type) => addComponent(type)} />
            ) : (
              <ComponentDock onAdd={(type) => addComponent(type)} />
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

// Long enough for the sheet to finish moving (its transition is 200ms) and the canvas to resize.
const SHEET_SETTLE_MS = 250;

/**
 * Compact: once the sheet has settled after the Inspector opened for item `id`, pans the view to
 * centre the item in the visible canvas if the sheet now covers it (or it is off screen).
 */
function usePanIntoView(wrapper: { current: HTMLDivElement | null }, id: string | null) {
  const reactFlow = useReactFlow<ComponentNode, ConnectionEdge>();
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => {
      const box = wrapper.current?.getBoundingClientRect();
      const edge = reactFlow.getEdge(id);
      const ends = edge ? [edge.source, edge.target] : [id];
      if (!box || ends.some((end) => !reactFlow.getInternalNode(end))) return;
      const rect = reactFlow.getNodesBounds(ends);
      const from = reactFlow.flowToScreenPosition({ x: rect.x, y: rect.y });
      const to = reactFlow.flowToScreenPosition({
        x: rect.x + rect.width,
        y: rect.y + rect.height,
      });
      const visible =
        from.x >= box.left && from.y >= box.top && to.x <= box.right && to.y <= box.bottom;
      if (visible) return;
      void reactFlow.setCenter(rect.x + rect.width / 2, rect.y + rect.height / 2, {
        zoom: reactFlow.getZoom(),
        duration: 200,
      });
    }, SHEET_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [id, reactFlow, wrapper]);
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
  locked,
  autosave,
  update,
  onAccepted,
}: {
  slug: string;
  proposal?: Proposal;
  onReview?: (review: Review | null) => void;
  nodes: ComponentNode[];
  edges: ConnectionEdge[];
  latest: { current: Flow };
  locked: { current: boolean };
  autosave: ReturnType<typeof useAutosave>;
  update: (nodes: ComponentNode[], edges: ConnectionEdge[], changed: boolean) => void;
  /** Called with the Proposal's seq in the same render that puts its result on the canvas. */
  onAccepted: (seq: number) => void;
}) {
  const token = useToken();
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
    locked.current = true;
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
      onAccepted(proposal.seq);
      setStatus(proposal.seq, 'accepted');
      void refreshKnowledge();
      setProgress({ busy: false, error: null });
    } catch (err) {
      setProgress({ busy: false, error: reviewError(err, refreshMessages) });
    } finally {
      locked.current = false;
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
  if (code === 'limit_reached') {
    return 'Accepting this would go over the project’s limit of requirements or decisions. Remove some, then try again.';
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

/**
 * The compact canvas's Proposal banner: "Proposal #N · Accept · Reject" on one line, the summary
 * clipped between, and a short second line when it is out of date or failed. The chat's Proposal
 * card keeps the full summary.
 */
function CompactProposalBar({ proposal, review }: { proposal: Proposal; review: Review | null }) {
  const note = review?.stale ? 'Out of date. Ask the AI to redo it.' : review?.error;
  return (
    <section aria-label="Proposal" {...stylex.props(styles.proposal, styles.compactProposal)}>
      <div {...stylex.props(styles.compactLine)}>
        <Label tone="accent" xstyle={styles.nowrap}>
          Proposal #{proposal.seq}
        </Label>
        <span {...stylex.props(styles.compactSummary)}>{proposal.summary}</span>
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
      {note && (
        <Text size="sm" tone={review?.stale ? 'muted' : 'accent'}>
          {note}
        </Text>
      )}
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
  // Clear of the pointer, so the connection under it stays visible.
  edgeWindow: { transform: 'translate(12px, 12px)' },
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
  compactProposal: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: space['--space-1'],
    width: 'calc(100vw - 2rem)',
    maxWidth: '36rem',
    paddingBlock: space['--space-2'],
  },
  nowrap: { whiteSpace: 'nowrap', flexShrink: 0 },
  compactLine: { display: 'flex', alignItems: 'center', gap: space['--space-2'], minWidth: 0 },
  compactSummary: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: text['--text-sm'],
    color: color['--color-fg-muted'],
  },
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
