import * as stylex from '@stylexjs/stylex';
import { X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { color, motion, radius, space } from '../design/tokens.stylex';
import { DecisionCard, DecisionForm } from '../knowledge/decisions';
import { isLimit } from '../lib/api';
import { useKnowledge, useKnowledgeActions } from '../lib/knowledge';
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

/**
 * Edits the one selected Component or Connection; otherwise explains how to use the canvas. The
 * canvas floats it next to an opened Component (see ArchitectureCanvas).
 */
export function Inspector({
  slug,
  saved,
  nodes,
  edges,
  onEditComponent,
  onEditConnection,
  onRemove,
  onClose,
  hint = 'Select something to edit it.',
}: {
  slug: string;
  /** Whether the canvas is saved: Decisions can only be attached to saved items. */
  saved: boolean;
  nodes: ComponentNode[];
  edges: ConnectionEdge[];
  onEditComponent: (id: string, patch: Partial<ComponentData>) => void;
  onEditConnection: (id: string, patch: Partial<ConnectionData>) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  /** What to say when there is nothing to edit. */
  hint?: string;
}) {
  const [node] = nodes;
  const [edge] = edges;
  const single = nodes.length + edges.length === 1;

  return (
    <section aria-label="Inspector" {...stylex.props(styles.panel, !single && styles.hint)}>
      {single && node ? (
        <>
          <Header onClose={onClose}>{typeDef(node.data.type).label}</Header>
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
          <ItemDecisions slug={slug} target={node.id} saved={saved} />
        </>
      ) : single && edge?.data ? (
        <>
          <Header onClose={onClose}>Connection</Header>
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
          <ItemDecisions slug={slug} target={edge.id} saved={saved} />
        </>
      ) : (
        <Text size="sm" tone="muted">
          {hint} Drag between components to connect them.
        </Text>
      )}
    </section>
  );
}

function Header({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div {...stylex.props(styles.header)}>
      <Label tone="accent">{children}</Label>
      <button
        type="button"
        aria-label="Close"
        title="Close"
        onClick={onClose}
        {...stylex.props(styles.close)}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

/** The Decisions explaining one Component or Connection, and a form to add one. */
function ItemDecisions({ slug, target, saved }: { slug: string; target: string; saved: boolean }) {
  const knowledge = useKnowledge(slug);
  const actions = useKnowledgeActions(slug);
  const [adding, setAdding] = useState(false);
  if (!knowledge.isSuccess) return null;
  const { decisions, requirements } = knowledge.data;
  const mine = decisions.filter((d) => d.targets.includes(target));

  return (
    <section aria-label="Decisions" {...stylex.props(styles.decisions)}>
      <Label>Decisions</Label>
      {mine.length === 0 && !adding && (
        <Text size="sm" tone="muted">
          No decision explains this yet.
        </Text>
      )}
      {mine.map((d) => (
        <DecisionCard
          key={d.id}
          slug={slug}
          decision={d}
          requirements={requirements}
          names={{}}
          compact
        />
      ))}
      {adding ? (
        <DecisionForm
          requirements={requirements}
          submitLabel="Add decision"
          busy={actions.addDecision.isPending}
          error={
            !actions.addDecision.isError
              ? null
              : isLimit(actions.addDecision.error)
                ? 'This project has the most decisions it can hold. Remove one to add another.'
                : "Couldn't add the decision. Try again."
          }
          onCancel={() => setAdding(false)}
          onSubmit={(input) =>
            actions.addDecision.mutate(
              { ...input, targets: [target] },
              { onSuccess: () => setAdding(false) },
            )
          }
        />
      ) : (
        <Button size="sm" variant="ghost" disabled={!saved} onClick={() => setAdding(true)}>
          {saved ? '+ Add decision' : 'Saving…'}
        </Button>
      )}
    </section>
  );
}

const styles = stylex.create({
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space['--space-2'],
  },
  close: {
    display: 'grid',
    placeItems: 'center',
    width: 28,
    height: 28,
    // Pull the icon into the corner without shrinking its hit area.
    marginBlock: `calc(-1 * ${space['--space-1']})`,
    marginInlineEnd: `calc(-1 * ${space['--space-2']})`,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius['--radius-sm'],
    backgroundColor: { default: 'transparent', ':hover': color['--color-subtle'] },
    color: { default: color['--color-fg-muted'], ':hover': color['--color-fg'] },
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: motion['--duration'],
  },
  decisions: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-2'],
    paddingTop: space['--space-3'],
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: color['--color-line'],
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-3'],
    width: '16rem',
    maxHeight: 'calc(100dvh - 15rem)',
    overflowY: 'auto',
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
