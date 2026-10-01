import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { color, font, radius, space, text } from '../design/tokens.stylex';
import { isLimit } from '../lib/api';
import {
  CATEGORIES,
  categoryLabel,
  LEVELS,
  type Requirement,
  useKnowledge,
  useKnowledgeActions,
} from '../lib/knowledge';
import { Button } from '../ui/button';
import { SelectField } from '../ui/select-field';
import { TextField } from '../ui/text-field';
import { Label, Text } from '../ui/typography';

/** The Requirements tab: the User's Experience Level and the Requirements, grouped by category. */
export function RequirementsPanel({ slug }: { slug: string }) {
  const knowledge = useKnowledge(slug);
  const actions = useKnowledgeActions(slug);
  const [category, setCategory] = useState<string>('scale');
  const [statement, setStatement] = useState('');

  if (knowledge.isError)
    return <Text tone="muted">Couldn't load the requirements. Refresh to try again.</Text>;
  if (!knowledge.isSuccess) return null;
  const { requirements, experienceLevel } = knowledge.data;

  return (
    <div {...stylex.props(styles.panel)}>
      <SelectField
        label="Your experience"
        value={experienceLevel}
        onChange={(e) => actions.setExperienceLevel.mutate(e.target.value)}
        options={[
          ...(experienceLevel ? [] : [{ value: '', label: 'Not set yet' }]),
          ...LEVELS.map((l) => ({ value: l.value, label: l.label })),
        ]}
      />

      {requirements.length === 0 && (
        <Text size="sm" tone="muted">
          No requirements yet. The AI records them as you describe the system, or add your own.
        </Text>
      )}
      {CATEGORIES.filter((c) => requirements.some((r) => r.category === c.value)).map((c) => (
        <section key={c.value} aria-label={c.label} {...stylex.props(styles.group)}>
          <Label>{c.label}</Label>
          <ul {...stylex.props(styles.list)}>
            {requirements
              .filter((r) => r.category === c.value)
              .map((r) => (
                <RequirementItem key={r.id} slug={slug} requirement={r} />
              ))}
          </ul>
        </section>
      ))}

      <form
        aria-label="Add requirement"
        {...stylex.props(styles.add)}
        onSubmit={(e) => {
          e.preventDefault();
          actions.addRequirement.mutate(
            { category, statement: statement.trim() },
            { onSuccess: () => setStatement('') },
          );
        }}
      >
        <SelectField
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
        />
        <TextField
          label="Requirement"
          placeholder="e.g. 10k requests per second at peak"
          value={statement}
          maxLength={300}
          onChange={(e) => setStatement(e.target.value)}
        />
        {actions.addRequirement.isError && (
          <Text size="sm" tone="accent">
            {isLimit(actions.addRequirement.error)
              ? 'This project has the most requirements it can hold. Remove one to add another.'
              : "Couldn't add the requirement. Try again."}
          </Text>
        )}
        <div>
          <Button
            type="submit"
            size="sm"
            disabled={statement.trim() === '' || actions.addRequirement.isPending}
          >
            Add requirement
          </Button>
        </div>
      </form>
    </div>
  );
}

function RequirementItem({ slug, requirement: r }: { slug: string; requirement: Requirement }) {
  const actions = useKnowledgeActions(slug);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(r.statement);

  if (editing) {
    return (
      <li>
        <form
          {...stylex.props(styles.row)}
          onSubmit={(e) => {
            e.preventDefault();
            actions.updateRequirement.mutate(
              { id: r.id, statement: draft.trim() },
              { onSuccess: () => setEditing(false) },
            );
          }}
        >
          <TextField
            label={`Edit ${r.id}`}
            hideLabel
            value={draft}
            maxLength={300}
            onChange={(e) => setDraft(e.target.value)}
            xstyle={styles.grow}
          />
          <Button type="submit" size="sm" disabled={draft.trim() === ''}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      </li>
    );
  }
  return (
    <li {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.id)}>{r.id}</span>
      <span {...stylex.props(styles.grow, styles.statement)}>{r.statement}</span>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Edit ${r.id}`}
        onClick={() => {
          setDraft(r.statement);
          setEditing(true);
        }}
      >
        Edit
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Delete ${r.id}`}
        onClick={() => actions.removeRequirement.mutate(r.id)}
      >
        Delete
      </Button>
    </li>
  );
}

/** "R2 (Scale) 10k requests per second" — used where a Requirement is cited. */
export function requirementText(r: Requirement) {
  return `${r.id} (${categoryLabel(r.category)}) ${r.statement}`;
}

const styles = stylex.create({
  panel: { display: 'flex', flexDirection: 'column', gap: space['--space-5'] },
  group: { display: 'flex', flexDirection: 'column', gap: space['--space-2'] },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-1'],
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: { display: 'flex', alignItems: 'center', gap: space['--space-2'] },
  grow: { flexGrow: 1, minWidth: 0 },
  id: {
    fontFamily: font['--font-mono'],
    fontSize: text['--text-xs'],
    color: color['--color-accent-strong'],
  },
  statement: { fontSize: text['--text-sm'] },
  add: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-3'],
    padding: space['--space-3'],
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color['--color-line-strong'],
    borderRadius: radius['--radius-md'],
  },
});
