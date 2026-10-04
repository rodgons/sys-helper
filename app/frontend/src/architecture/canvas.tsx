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
import { Redo2, Undo2, Workflow } from 'lucide-react';
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
import { History, type Snapshot, type StepChanges, stepChanges } from './history';
import { Inspector } from './inspector';
import { tidy } from './layout';
import {
  type ComponentData,
  type ComponentNode,
  type ConnectionData,
  type ConnectionEdge,
  type Diff,
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

/**
 * An edit to the document, as one undo step: its label ("Delete Database"), the run it merges into
 * (see History) and, when the canvas already shows part of it (a drag), the canvas before it began.
 */
type Edit = { label: string; run?: string; before?: Flow };

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const UNDO_KEYS = MAC ? '⌘Z' : 'Ctrl+Z';
const REDO_KEYS = MAC ? '⇧⌘Z' : 'Ctrl+Y';

/** The undo (or redo) shortcut a keypress is, if any: ⌘Z/Ctrl+Z; ⇧⌘Z, Ctrl+Shift+Z or Ctrl+Y. */
function shortcut(e: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  // A text field keeps its own undo.
  if (
    e.target instanceof Element &&
    e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
  )
    return null;
  const key = e.key.toLowerCase();
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && e.ctrlKey && !e.shiftKey) return 'redo';
  return null;
}

/** "Delete Database", "Delete 2 components", "Delete connection". */
function deleteLabel(nodes: ComponentNode[], edges: number) {
  const [only] = nodes;
  if (only && nodes.length === 1) return `Delete ${only.data.name}`;
  if (nodes.length > 1) return `Delete ${nodes.length} components`;
  return edges === 1 ? 'Delete connection' : `Delete ${edges} connections`;
}

/** Which field of a Component a patch edits, so typing in one field merges into one step. */
function editedField(node: ComponentNode | undefined, patch: Partial<ComponentData>) {
  if ('name' in patch) return 'name';
  const before = node?.data.properties ?? {};
  const after = patch.properties ?? {};
  return Object.keys(after).find((k) => after[k] !== before[k]) ?? 'properties';
}

function Editor({ slug, initial, proposal: pending, onReview, onNames, sheet }: CanvasProps) {
  const compact = sheet !== undefined;
  // The Proposal this canvas just accepted. The cached Conversation marks it accepted a render
  // later; until then it still arrives as pending and must not be previewed on top of its result.
  const [acceptedSeq, setAcceptedSeq] = useState<number | null>(null);
  // Undo and redo for this visit: the canvas is keyed by Project, so a new one starts empty.
  const [history] = useState(() => new History());
  // Set while an undo or redo puts a step back, which mustn't record a step of its own.
  const replaying = useRef(false);
  const proposal = pending?.seq === acceptedSeq ? undefined : pending;
  const [flow, setFlow] = useState(() => toFlow(initial.document));
  // Fit a saved architecture into view on load. An empty canvas must not fit: React Flow would wait
  // for the first component added and then re-centre the view on it, under the inspector.
  const [fitOnLoad] = useState(initial.document.components.length > 0);
  const latest = useRef(flow);
  const refreshKnowledge = useRefreshKnowledge(slug);
  // A save changes which Decisions show (those whose items are off the canvas are hidden), so
  // reload them after each one.
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
  /** Every change to the canvas goes through here; an `edit` is saved and is one undo step. */
  const update = (nodes: ComponentNode[], edges: ConnectionEdge[], edit: Edit | false) => {
    if (edit && locked.current) return;
    if (edit && !replaying.current) {
      history.record(edit.before ?? latest.current, edit.label, edit.run);
      setFlash(null);
    }
    latest.current = { nodes, edges };
    setFlow(latest.current);
    if (edit) autosave.schedule(fromFlow(nodes, edges));
  };
  const nameOf = (id: string) => latest.current.nodes.find((n) => n.id === id)?.data.name ?? id;
  // The canvas when a drag began: the drag's moves show as they happen, but undo as one step.
  const dragStart = useRef<Flow | null>(null);
  // Backspace deletes in two batches, Connections then Components; both belong to this step.
  const deleting = useRef<Edit | null>(null);
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
    onAccepted: (seq, before) => {
      history.record(before, `Accept Proposal #${seq}`);
      setAcceptedSeq(seq);
    },
  });

  // History stays put while an accept or reject is being sent, and once saving has stopped.
  const historyLocked = Boolean(review.state?.busy) || autosave.status === 'conflict';
  // What the last undo or redo changed, flashed with the Proposal preview's markers for a moment.
  const [flash, setFlash] = useState<StepChanges | null>(null);
  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [flash]);
  // Numbered so that saying the same thing twice in a row is still a change screen readers announce.
  const [announcement, setAnnouncement] = useState({ text: '', n: 0 });
  // Set by an undo or redo: the Inspector stays shut until the User picks something themselves.
  const [inspectorShut, setInspectorShut] = useState(false);
  // The item whose Inspector is open, if any (set during render, read by restore).
  const inspecting = useRef<string | null>(null);
  const [panTo, setPanTo] = useState<{ ids: string[] } | null>(null);
  useShowItems(wrapper, panTo?.ids ?? null);

  /** Undoes or redoes a step: saved like any edit, then selected, shown and announced. */
  const restore = (direction: 'undo' | 'redo') => {
    if (historyLocked || locked.current) return;
    const current = latest.current;
    const step = direction === 'undo' ? history.undo(current) : history.redo(current);
    if (!step) return;
    const changes = stepChanges(current, step.before);
    const touched = new Set([...changes.added, ...changes.changed]);
    replaying.current = true;
    update(
      step.before.nodes.map((n) => ({ ...n, selected: touched.has(n.id) })),
      step.before.edges.map((e) => ({ ...e, selected: touched.has(e.id) })),
      { label: step.label },
    );
    replaying.current = false;
    setFlash(changes);
    const text = `${direction === 'undo' ? 'Undid' : 'Redid'} ${step.label}`;
    setAnnouncement((a) => ({ text, n: a.n + 1 }));
    if (touched.size > 0) setPanTo({ ids: [...touched] });
    // Never open the Inspector; one already open on the only item changed stays open.
    const open = inspecting.current;
    if (!(open && touched.size === 1 && touched.has(open))) {
      setOpened(null);
      setClicked(null);
      setInspectorShut(true);
      if (sheet?.open) sheet.onOpenChange(false);
    }
  };
  const shortcuts = useRef(restore);
  shortcuts.current = restore;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const direction = shortcut(e);
      if (!direction) return;
      e.preventDefault();
      shortcuts.current(direction);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
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
  // A Proposal's preview wins over the flash, so a review never loses sight of it.
  const base = review.preview ?? (flash ? flashed(flow, flash) : flow);
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
    update(latest.current.nodes, [...latest.current.edges, newConnectionEdge(source, target)], {
      label: `Connect ${nameOf(source)} → ${nameOf(target)}`,
    });
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
    // A new component opens straight away, to be named: in the sheet on compact (so crossing to
    // desktop leaves it just selected), else in its window.
    setInspectorShut(false);
    if (sheet) sheet.onOpenChange(true);
    else setOpened(node.id);
    update(
      [
        ...latest.current.nodes.map((n) => ({ ...n, selected: false })),
        { ...node, selected: true },
      ],
      latest.current.edges.map((e) => ({ ...e, selected: false })),
      { label: `Add ${node.data.name}` },
    );
  };

  // Typing in one field of one item is one step, until the field loses focus (history.endRun).
  const editComponent = (id: string, patch: Partial<ComponentData>) => {
    const node = latest.current.nodes.find((n) => n.id === id);
    update(
      latest.current.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
      latest.current.edges,
      { label: `Edit ${nameOf(id)}`, run: `${id}:${editedField(node, patch)}` },
    );
  };

  const editConnection = (id: string, patch: Partial<ConnectionData>) =>
    update(
      latest.current.nodes,
      latest.current.edges.map((e) =>
        e.id === id ? { ...e, data: { ...(e.data as ConnectionData), ...patch } } : e,
      ),
      { label: 'Edit connection', run: 'label' in patch ? `${id}:label` : undefined },
    );

  /** Rearranges every component so connections flow left to right, then brings it all into view. */
  const tidyUp = () => {
    update(tidy(latest.current.nodes, latest.current.edges), latest.current.edges, {
      label: 'Tidy up',
    });
    void reactFlow.fitView({ ...fit, duration: 300 });
  };

  const remove = (id: string) => {
    const node = latest.current.nodes.find((n) => n.id === id);
    update(
      latest.current.nodes.filter((n) => n.id !== id),
      latest.current.edges.filter((e) => e.id !== id && e.source !== id && e.target !== id),
      { label: deleteLabel(node ? [node] : [], node ? 0 : 1) },
    );
  };

  /** The undo step for React Flow's own changes to Components: a drag, a keyboard move or Backspace. */
  const nodesEdit = (changes: NodeChange<ComponentNode>[]): Edit | false => {
    if (changes.some((c) => c.type === 'position' && c.dragging))
      dragStart.current ??= latest.current;
    if (!changes.some(changesDocument)) return false;
    const removed = changes.flatMap((c) => (c.type === 'remove' ? [c.id] : []));
    if (removed.length > 0)
      return (
        deleting.current ?? {
          label: deleteLabel(
            latest.current.nodes.filter((n) => removed.includes(n.id)),
            0,
          ),
        }
      );
    const moved = changes.flatMap((c) => (c.type === 'position' && !c.dragging ? [c.id] : []));
    const before = dragStart.current ?? undefined;
    dragStart.current = null;
    const [one] = moved;
    if (one === undefined) return { label: 'Edit canvas', before };
    return {
      label: moved.length === 1 ? `Move ${nameOf(one)}` : `Move ${moved.length} components`,
      before,
    };
  };

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
  inspecting.current = compact
    ? sheetInspector
      ? (selectedNodes[0]?.id ?? selectedEdges[0]?.id ?? null)
      : null
    : (floating?.id ?? edgeAnchor?.id ?? null);
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
      onEditEnd={() => history.endRun()}
      // Closing keeps the selection, and the spotlight on it.
      onClose={() => sheet?.onOpenChange(false)}
      inSheet
    />
  ) : (
    <Inspector
      slug={slug}
      saved={autosave.status === 'saved'}
      nodes={inspectorShut || (only && !floating) ? [] : selectedNodes}
      edges={inspectorShut && !edgeAnchor ? [] : selectedEdges}
      hint={only && !floating ? 'Click it again to edit it.' : undefined}
      onEditComponent={editComponent}
      onEditConnection={editConnection}
      onRemove={remove}
      onEditEnd={() => history.endRun()}
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
          const edit = nodesEdit(changes);
          update(applyNodeChanges(changes, latest.current.nodes), latest.current.edges, edit);
        }}
        onEdgesChange={(all) => {
          const changes = all.filter((c) => !('id' in c) || editorEdgeIds.has(c.id));
          if (changes.length === 0) return;
          const removed = changes.filter((c) => c.type === 'remove').length;
          const edit: Edit | false = !changes.some(changesDocument)
            ? false
            : (deleting.current ?? { label: deleteLabel([], removed) });
          update(latest.current.nodes, applyEdgeChanges(changes, latest.current.edges), edit);
        }}
        // Backspace: one step for the Connections and Components it deletes, named after them.
        onBeforeDelete={async ({ nodes: gone, edges: goneEdges }) => {
          deleting.current = {
            label: deleteLabel(gone, goneEdges.length),
            run: `delete:${crypto.randomUUID()}`,
          };
          return true;
        }}
        onDelete={() => {
          deleting.current = null;
        }}
        onConnect={onConnect}
        // Compact: one tap selects and opens the Inspector in the sheet. Desktop: a click selects,
        // a second click opens the window beside the component.
        onNodeClick={(_, node) => {
          setInspectorShut(false);
          if (compact) sheet.onOpenChange(true);
          else setOpened(selectedBefore.current === node.id ? node.id : null);
        }}
        onPaneClick={() => {
          setInspectorShut(false);
          if (compact) sheet.onOpenChange(false);
          else setOpened(null);
        }}
        // Esc closes the component's window, then clears the selection and with it the spotlight.
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return;
          if (compact && sheet.open) sheet.onOpenChange(false);
          else if (floating) setOpened(null);
          else deselect();
        }}
        onEdgeClick={(e, edge) => {
          setInspectorShut(false);
          if (compact) sheet.onOpenChange(true);
          else
            setClicked({
              id: edge.id,
              ...reactFlow.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
            });
        }}
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
          className={compact ? 'compact-controls' : undefined}
          showInteractive={false}
          showZoom={!compact}
          // Compact: one row beside "+ Add", clear of the Proposal banner above them.
          orientation={compact ? 'horizontal' : 'vertical'}
          fitViewOptions={fit}
        >
          <HistoryButton
            direction="undo"
            label={history.undoLabel}
            disabled={historyLocked}
            onClick={() => restore('undo')}
          />
          <HistoryButton
            direction="redo"
            label={history.redoLabel}
            disabled={historyLocked}
            onClick={() => restore('redo')}
          />
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
          {/* Not a status: the canvas has exactly one, the save indicator. */}
          <div aria-live="polite" {...stylex.props(styles.srOnly)}>
            <span key={announcement.n}>{announcement.text}</span>
          </div>
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

// Long enough for the sheet to finish moving (its transition is `--duration`, 150ms) and the canvas
// to resize.
const SHEET_SETTLE_MS = 250;

/**
 * Compact: once the sheet has settled after the Inspector opened for item `id`, pans the view to
 * centre the item in the visible canvas if the sheet now covers it (or it is off screen).
 */
function usePanIntoView(wrapper: { current: HTMLDivElement | null }, id: string | null) {
  const show = useShow(wrapper);
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => show([id]), SHEET_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [id, show]);
}

/** After an undo or redo: centres the changed items if none of them is in view. */
function useShowItems(wrapper: { current: HTMLDivElement | null }, ids: string[] | null) {
  const show = useShow(wrapper);
  useEffect(() => {
    if (ids) show(ids, { any: true });
  }, [ids, show]);
}

/**
 * Pans, without zooming, to centre Components and Connections (by id) in the canvas unless they
 * are already all in view, or with `any`, unless one of them is.
 */
function useShow(wrapper: { current: HTMLDivElement | null }) {
  const reactFlow = useReactFlow<ComponentNode, ConnectionEdge>();
  return useCallback(
    (ids: string[], { any = false } = {}) => {
      const box = wrapper.current?.getBoundingClientRect();
      const ends = (id: string) => {
        const edge = reactFlow.getEdge(id);
        return edge ? [edge.source, edge.target] : [id];
      };
      const all = ids.flatMap(ends);
      if (!box || all.length === 0 || all.some((end) => !reactFlow.getInternalNode(end))) return;
      const inView = (items: string[]) => {
        const rect = reactFlow.getNodesBounds(items);
        const from = reactFlow.flowToScreenPosition({ x: rect.x, y: rect.y });
        const to = reactFlow.flowToScreenPosition({
          x: rect.x + rect.width,
          y: rect.y + rect.height,
        });
        return from.x >= box.left && from.y >= box.top && to.x <= box.right && to.y <= box.bottom;
      };
      if (any ? ids.some((id) => inView(ends(id))) : inView(all)) return;
      const rect = reactFlow.getNodesBounds(all);
      void reactFlow.setCenter(rect.x + rect.width / 2, rect.y + rect.height / 2, {
        zoom: reactFlow.getZoom(),
        duration: 200,
      });
    },
    [reactFlow, wrapper],
  );
}

type Flow = Snapshot;

// How long an undo or redo flashes what it changed.
const FLASH_MS = 1500;

/**
 * The canvas with an undo or redo's changes marked like a Proposal preview's: added and changed
 * items outlined, and what it removed as faded ghosts that can't be selected, dragged or connected.
 */
function flashed(flow: Flow, changes: StepChanges): Flow {
  const mark = (id: string): Diff | undefined =>
    changes.added.has(id) ? 'added' : changes.changed.has(id) ? 'changed' : undefined;
  return {
    nodes: [
      ...flow.nodes.map((n) => {
        const diff = mark(n.id);
        return diff ? { ...n, data: { ...n.data, diff } } : n;
      }),
      ...changes.removed.nodes.map((n) => ({
        ...n,
        selected: false,
        selectable: false,
        draggable: false,
        connectable: false,
        data: { ...n.data, diff: 'removed' as const },
      })),
    ],
    edges: [
      ...flow.edges.map((e) => {
        const diff = mark(e.id);
        return diff && e.data ? { ...e, data: { ...e.data, diff } } : e;
      }),
      ...changes.removed.edges.map((e) => ({
        ...e,
        selected: false,
        selectable: false,
        data: e.data && { ...e.data, diff: 'removed' as const },
      })),
    ],
  };
}
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
  update: (nodes: ComponentNode[], edges: ConnectionEdge[], edit: false) => void;
  /**
   * Called with the Proposal's seq, and the canvas it replaced, in the same render that puts its
   * result on the canvas. Only a successful accept calls it.
   */
  onAccepted: (seq: number, before: Flow) => void;
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
      const before = latest.current;
      // Already saved by the accept, so no autosave; the Editor records it as one undo step.
      update(n, e, false);
      onAccepted(proposal.seq, before);
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

/**
 * Undo or Redo in the canvas controls, named after the step it takes ("Undo Delete Database") and
 * disabled when there is none.
 */
function HistoryButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: 'undo' | 'redo';
  label: string | null;
  disabled: boolean;
  onClick: () => void;
}) {
  const [verb, keys, Icon] =
    direction === 'undo'
      ? (['Undo', UNDO_KEYS, Undo2] as const)
      : (['Redo', REDO_KEYS, Redo2] as const);
  const name = label ? `${verb} ${label}` : verb;
  return (
    <ControlButton
      onClick={onClick}
      disabled={disabled || !label}
      aria-label={name}
      title={`${name} (${keys})`}
    >
      <Icon />
    </ControlButton>
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
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
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
