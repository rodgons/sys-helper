import * as stylex from '@stylexjs/stylex';
import { type ReactNode, useState } from 'react';
import { color, font, radius, space, text } from '../design/tokens.stylex';
import {
  type Decision,
  type DecisionInput,
  type Requirement,
  useKnowledge,
  useKnowledgeActions,
} from '../lib/knowledge';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { TextArea } from '../ui/text-area';
import { TextField } from '../ui/text-field';
import { Text } from '../ui/typography';
import { requirementText } from './requirements-panel';

/** The Decisions tab: every Decision, flagged ones first. `names` maps canvas ids to names. */
export function DecisionsPanel({ slug, names }: { slug: string; names: Record<string, string> }) {
  const knowledge = useKnowledge(slug);
  if (knowledge.isError)
    return <Text tone="muted">Couldn't load the decisions. Refresh to try again.</Text>;
  if (!knowledge.isSuccess) return null;
  const { decisions, requirements } = knowledge.data;
  if (decisions.length === 0) {
    return (
      <Text size="sm" tone="muted">
        No decisions yet. The AI records one for every change it proposes, and you can add your own
        from a component's inspector.
      </Text>
    );
  }
  const ordered = [...decisions].sort((a, b) => Number(b.needsReview) - Number(a.needsReview));
  return (
    <ul {...stylex.props(styles.list)}>
      {ordered.map((d) => (
        <li key={d.id}>
          <DecisionCard slug={slug} decision={d} requirements={requirements} names={names} />
        </li>
      ))}
    </ul>
  );
}

/** One Decision with its reasoning, what it explains and cites, and actions. */
export function DecisionCard({
  slug,
  decision: d,
  requirements,
  names,
  compact = false,
}: {
  slug: string;
  decision: Decision;
  requirements: Requirement[];
  names: Record<string, string>;
  compact?: boolean;
}) {
  const actions = useKnowledgeActions(slug);
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <DecisionForm
        initial={d}
        requirements={requirements}
        submitLabel="Save decision"
        busy={actions.updateDecision.isPending}
        onCancel={() => setEditing(false)}
        onSubmit={(input) =>
          actions.updateDecision.mutate(
            { id: d.id, ...input },
            { onSuccess: () => setEditing(false) },
          )
        }
      />
    );
  }
  const cited = d.requirements
    .map((id) => requirements.find((r) => r.id === id))
    .filter((r) => r !== undefined);
  return (
    <article
      aria-label={`${d.id} ${d.title}`}
      {...stylex.props(styles.card, d.needsReview && styles.flagged)}
    >
      <div {...stylex.props(styles.head)}>
        <span {...stylex.props(styles.id)}>{d.id}</span>
        <span {...stylex.props(styles.title)}>{d.title}</span>
        <Badge tone={d.author === 'ai' ? 'accent' : 'neutral'}>
          {d.author === 'ai' ? 'AI' : 'You'}
        </Badge>
      </div>
      {d.needsReview && (
        <div role="status" {...stylex.props(styles.review)}>
          <Text size="sm">A requirement it cites changed. Does it still hold?</Text>
          <Button
            size="sm"
            variant="outline"
            onClick={() => actions.updateDecision.mutate({ id: d.id })}
          >
            Still valid
          </Button>
        </div>
      )}
      <Text size="sm">{d.rationale}</Text>
      {!compact && (
        <dl {...stylex.props(styles.facts)}>
          {d.pattern && <Fact term="Pattern">{d.pattern}</Fact>}
          {d.alternative && <Fact term="Rejected">{d.alternative}</Fact>}
          <Fact term="Explains">{d.targets.map((t) => names[t] ?? t).join(', ')}</Fact>
          {cited.length > 0 && <Fact term="Serves">{cited.map(requirementText).join('; ')}</Fact>}
        </dl>
      )}
      <div {...stylex.props(styles.actions)}>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Delete ${d.id}`}
          onClick={() => actions.removeDecision.mutate(d.id)}
        >
          Delete
        </Button>
      </div>
    </article>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div {...stylex.props(styles.fact)}>
      <dt {...stylex.props(styles.term)}>{term}</dt>
      <dd {...stylex.props(styles.definition)}>{children}</dd>
    </div>
  );
}

/** Writes or edits a Decision: what was chosen, why, the pattern, the alternative, what it serves. */
export function DecisionForm({
  initial,
  requirements,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: DecisionInput;
  requirements: Requirement[];
  submitLabel: string;
  busy: boolean;
  onSubmit: (input: DecisionInput) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<DecisionInput>(
    initial ?? { title: '', rationale: '', pattern: '', alternative: '', requirements: [] },
  );
  const set = (patch: Partial<DecisionInput>) => setD((cur) => ({ ...cur, ...patch }));
  return (
    <form
      aria-label="Decision details"
      {...stylex.props(styles.form)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(d);
      }}
    >
      <TextField
        label="Decision"
        placeholder="e.g. PostgreSQL for orders"
        value={d.title}
        maxLength={120}
        onChange={(e) => set({ title: e.target.value })}
      />
      <TextArea
        label="Why"
        value={d.rationale}
        maxLength={2000}
        onChange={(e) => set({ rationale: e.target.value })}
      />
      <TextField
        label="Pattern"
        placeholder="e.g. Cache-aside"
        value={d.pattern}
        maxLength={120}
        onChange={(e) => set({ pattern: e.target.value })}
      />
      <TextField
        label="Alternative rejected"
        value={d.alternative}
        maxLength={1000}
        onChange={(e) => set({ alternative: e.target.value })}
      />
      {requirements.length > 0 && (
        <fieldset {...stylex.props(styles.fieldset)}>
          <legend {...stylex.props(styles.term)}>Serves</legend>
          {requirements.map((r) => (
            <label key={r.id} {...stylex.props(styles.check)}>
              <input
                type="checkbox"
                checked={d.requirements.includes(r.id)}
                onChange={(e) =>
                  set({
                    requirements: e.target.checked
                      ? [...d.requirements, r.id]
                      : d.requirements.filter((id) => id !== r.id),
                  })
                }
              />
              {requirementText(r)}
            </label>
          ))}
        </fieldset>
      )}
      <div {...stylex.props(styles.actions)}>
        <Button
          type="submit"
          size="sm"
          disabled={busy || d.title.trim() === '' || d.rationale.trim() === ''}
        >
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const styles = stylex.create({
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-3'],
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-2'],
    padding: space['--space-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-md'],
    backgroundColor: color['--color-surface'],
  },
  flagged: { borderColor: color['--color-warning'] },
  head: { display: 'flex', alignItems: 'center', gap: space['--space-2'] },
  id: {
    fontFamily: font['--font-mono'],
    fontSize: text['--text-xs'],
    color: color['--color-accent-strong'],
  },
  title: { flexGrow: 1, fontSize: text['--text-sm'], fontWeight: 600 },
  review: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space['--space-2'],
  },
  facts: { display: 'flex', flexDirection: 'column', gap: space['--space-1'], margin: 0 },
  fact: { display: 'flex', gap: space['--space-2'] },
  term: {
    flexShrink: 0,
    width: '5.5rem',
    fontFamily: font['--font-mono'],
    fontSize: '0.625rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: color['--color-fg-muted'],
    paddingTop: 2,
  },
  definition: { margin: 0, fontSize: text['--text-xs'], color: color['--color-fg'] },
  actions: { display: 'flex', gap: space['--space-2'] },
  form: { display: 'flex', flexDirection: 'column', gap: space['--space-3'] },
  fieldset: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-1'],
    margin: 0,
    padding: 0,
    borderWidth: 0,
  },
  check: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: space['--space-2'],
    fontSize: text['--text-xs'],
  },
});
