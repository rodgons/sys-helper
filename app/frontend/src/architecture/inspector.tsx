import * as stylex from '@stylexjs/stylex';
import { color, radius, space } from '../design/tokens.stylex';
import { Button } from '../ui/button';
import { SelectField } from '../ui/select-field';
import { TextField } from '../ui/text-field';
import { Label, Text } from '../ui/typography';
import {
  CONNECTION_KINDS,
  type ComponentData,
  type ComponentNode,
  type ConnectionData,
  type ConnectionEdge,
  type ConnectionKind,
  typeDef,
} from './model';

/** Edits the one selected Component or Connection; otherwise explains how to use the canvas. */
export function Inspector({
  nodes,
  edges,
  onEditComponent,
  onEditConnection,
  onRemove,
}: {
  nodes: ComponentNode[];
  edges: ConnectionEdge[];
  onEditComponent: (id: string, patch: Partial<ComponentData>) => void;
  onEditConnection: (id: string, patch: Partial<ConnectionData>) => void;
  onRemove: (id: string) => void;
}) {
  const [node] = nodes;
  const [edge] = edges;
  const single = nodes.length + edges.length === 1;

  return (
    <section aria-label="Inspector" {...stylex.props(styles.panel, !single && styles.hint)}>
      {single && node ? (
        <>
          <Label tone="accent">{typeDef(node.data.type).label}</Label>
          <TextField
            label="Name"
            value={node.data.name}
            maxLength={100}
            onChange={(e) => onEditComponent(node.id, { name: e.target.value })}
          />
          {typeDef(node.data.type).properties.map((p) => (
            <TextField
              key={p.key}
              label={p.label}
              placeholder={p.placeholder}
              value={node.data.properties[p.key] ?? ''}
              maxLength={500}
              onChange={(e) =>
                onEditComponent(node.id, {
                  properties: { ...node.data.properties, [p.key]: e.target.value },
                })
              }
            />
          ))}
          <Button size="sm" variant="outline" onClick={() => onRemove(node.id)}>
            Delete component
          </Button>
        </>
      ) : single && edge?.data ? (
        <>
          <Label tone="accent">Connection</Label>
          <SelectField
            label="Kind"
            value={edge.data.kind}
            options={CONNECTION_KINDS.map((k) => ({ value: k.kind, label: k.label }))}
            onChange={(e) => onEditConnection(edge.id, { kind: e.target.value as ConnectionKind })}
          />
          <TextField
            label="Label"
            placeholder="e.g. REST, order events"
            value={edge.data.label}
            maxLength={100}
            onChange={(e) => onEditConnection(edge.id, { label: e.target.value })}
          />
          <Button size="sm" variant="outline" onClick={() => onRemove(edge.id)}>
            Delete connection
          </Button>
        </>
      ) : (
        <Text size="sm" tone="muted">
          Select something to edit it. Drag between components to connect them.
        </Text>
      )}
    </section>
  );
}

const styles = stylex.create({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-3'],
    width: '16rem',
    padding: space['--space-4'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-md'],
    backgroundColor: color['--color-surface'],
  },
  // With nothing to edit, shrink to a one-line hint so the canvas stays visible.
  hint: {
    width: 'auto',
    maxWidth: '16rem',
    paddingBlock: space['--space-2'],
    paddingInline: space['--space-3'],
  },
});
