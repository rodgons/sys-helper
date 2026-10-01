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
import { useRef, useState } from 'react';
import { color, radius, space, text } from '../design/tokens.stylex';
import type { VersionedArchitecture } from '../lib/architecture';
import { Button } from '../ui/button';
import { SelectField } from '../ui/select-field';
import { Text } from '../ui/typography';
import { type SaveStatus, useAutosave } from './autosave';
import { Inspector } from './inspector';
import {
  COMPONENT_TYPES,
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

/** The editable Architecture canvas. Every change is autosaved; see useAutosave. */
export function ArchitectureCanvas(props: { slug: string; initial: VersionedArchitecture }) {
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

function Editor({ slug, initial }: { slug: string; initial: VersionedArchitecture }) {
  const [flow, setFlow] = useState(() => toFlow(initial.document));
  // Fit a saved architecture into view on load. An empty canvas must not fit: React Flow would wait
  // for the first component added and then re-centre the view on it, under the inspector.
  const [fitOnLoad] = useState(initial.document.components.length > 0);
  const latest = useRef(flow);
  const autosave = useAutosave(slug, initial.version);
  const reactFlow = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const update = (nodes: ComponentNode[], edges: ConnectionEdge[], changed: boolean) => {
    latest.current = { nodes, edges };
    setFlow(latest.current);
    if (changed) autosave.schedule(fromFlow(nodes, edges));
  };
  const { nodes, edges } = flow;

  const onConnect = ({ source, target }: Connection) => {
    const duplicate = latest.current.edges.some((e) => e.source === source && e.target === target);
    if (source === target || duplicate) return;
    update(
      latest.current.nodes,
      [...latest.current.edges, newConnectionEdge(source, target)],
      true,
    );
  };

  const addComponent = (type: string) => {
    // Aim for the middle of the visible area left of the inspector, which floats over the right edge.
    const box = wrapper.current?.getBoundingClientRect();
    const center = reactFlow.screenToFlowPosition({
      x: (box?.left ?? 0) + Math.max((box?.width ?? 0) - INSPECTOR_SPACE, 0) / 2,
      y: (box?.top ?? 0) + (box?.height ?? 0) / 2,
    });
    const position = freeSpot({ x: center.x - 90, y: center.y - 45 }, latest.current.nodes);
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
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={(changes) =>
          update(
            applyNodeChanges(changes, latest.current.nodes),
            latest.current.edges,
            changes.some(changesDocument),
          )
        }
        onEdgesChange={(changes) =>
          update(
            latest.current.nodes,
            applyEdgeChanges(changes, latest.current.edges),
            changes.some(changesDocument),
          )
        }
        onConnect={onConnect}
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
          <div {...stylex.props(styles.toolbar)}>
            <SelectField
              label="Add component"
              hideLabel
              value=""
              onChange={(e) => {
                if (e.target.value) addComponent(e.target.value);
              }}
              options={[
                { value: '', label: 'Add component…' },
                ...COMPONENT_TYPES.map((t) => ({ value: t.type, label: t.label })),
              ]}
            />
            <SaveIndicator status={autosave.status} />
          </div>
        </Panel>
        <Panel position="top-right">
          <Inspector
            nodes={nodes.filter((n) => n.selected)}
            edges={edges.filter((e) => e.selected)}
            onEditComponent={editComponent}
            onEditConnection={editConnection}
            onRemove={remove}
          />
        </Panel>
        {autosave.status === 'conflict' && (
          <Panel position="bottom-center">
            <div role="alert" {...stylex.props(styles.conflict)}>
              <Text size="sm">
                This architecture changed in another tab or window, so edits here are no longer
                saved. Reload to continue from the latest version.
              </Text>
              <Button size="sm" onClick={() => window.location.reload()}>
                Reload
              </Button>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
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
  toolbar: { display: 'flex', alignItems: 'center', gap: space['--space-3'] },
  status: { fontSize: text['--text-xs'], color: color['--color-fg-muted'] },
  statusError: { color: color['--color-danger'] },
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
