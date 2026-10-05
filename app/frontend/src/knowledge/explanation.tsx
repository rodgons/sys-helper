import * as stylex from '@stylexjs/stylex';
import { ExternalLink } from 'lucide-react';
import { useId, useState } from 'react';
import { Markdown } from '../conversation/markdown';
import { color, font, media, radius, space, text } from '../design/tokens.stylex';
import { type LevelTexts, useExplanations } from '../lib/explanations';
import { LEVELS, useKnowledge } from '../lib/knowledge';

type Level = keyof LevelTexts;

/** What an explanation shows, for a Pattern or a Component Type alike. */
type Entry = { gist: string; reference: string; explanations: LevelTexts };

/**
 * A Decision's pattern as written and, when it names a catalog Pattern, a "What is …?" disclosure
 * under it. While the catalog is loading, or if it failed to load, the text stays plain.
 */
export function PatternText({
  slug,
  text: value,
  patternId,
}: {
  slug: string;
  text: string;
  patternId?: string;
}) {
  const explanations = useExplanations();
  const pattern = patternId
    ? explanations.data?.patterns.find((p) => p.id === patternId)
    : undefined;
  if (!pattern) return <>{value}</>;
  return (
    <span {...stylex.props(styles.stack)}>
      <span>{value}</span>
      <Disclosure slug={slug} name={pattern.name} entry={pattern} />
    </span>
  );
}

/** "What is <Component Type>?" for the types the catalog explains (never Custom). */
export function ComponentTypeExplanation({ slug, type }: { slug: string; type: string }) {
  const explanations = useExplanations();
  const entry = explanations.data?.componentTypes.find((t) => t.type === type);
  if (!entry) return null;
  return <Disclosure slug={slug} name={entry.name} entry={entry} />;
}

/** A `<datalist>` of the catalog's Pattern names, for the Decision form's pattern field. */
export function PatternSuggestions({ id }: { id: string }) {
  const explanations = useExplanations();
  return (
    <datalist id={id}>
      {explanations.data?.patterns.map((p) => (
        <option key={p.id} value={p.name} />
      ))}
    </datalist>
  );
}

function Disclosure({ slug, name, entry }: { slug: string; name: string; entry: Entry }) {
  return (
    <details {...stylex.props(styles.details)}>
      <summary {...stylex.props(styles.summary)}>What is {name}?</summary>
      <Explanation slug={slug} entry={entry} />
    </details>
  );
}

/**
 * The gist, a tab per Experience Level (opening on the Project's, marked "yours", or Intermediate
 * when none is recorded), the chosen level's text and a link to the reference.
 */
function Explanation({ slug, entry }: { slug: string; entry: Entry }) {
  const recorded = useKnowledge(slug).data?.experienceLevel;
  const yours = LEVELS.find((l) => l.value === recorded)?.value;
  // Follows the Project's level, which may load after this opens, until the User picks a tab.
  const [picked, setLevel] = useState<Level>();
  const level = picked ?? yours ?? 'intermediate';
  const id = useId();
  return (
    <div {...stylex.props(styles.body)}>
      <p {...stylex.props(styles.gist)}>{entry.gist}</p>
      <div role="tablist" aria-label="Explain for" {...stylex.props(styles.tabs)}>
        {LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            role="tab"
            id={`${id}-${l.value}`}
            aria-selected={level === l.value}
            aria-controls={`${id}-panel`}
            onClick={() => setLevel(l.value)}
            {...stylex.props(styles.tab, level === l.value && styles.tabOn)}
          >
            {l.label}
            {l.value === yours && <span {...stylex.props(styles.yours)}> · yours</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${level}`}>
        <Markdown>{entry.explanations[level]}</Markdown>
      </div>
      <a
        href={entry.reference}
        target="_blank"
        rel="noreferrer noopener"
        {...stylex.props(styles.reference)}
      >
        Read more <ExternalLink size={12} aria-hidden="true" />
      </a>
    </div>
  );
}

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: space['--space-1'] },
  details: { minWidth: 0 },
  summary: {
    cursor: 'pointer',
    fontSize: text['--text-xs'],
    color: color['--color-accent-strong'],
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-2'],
    marginTop: space['--space-2'],
    fontSize: text['--text-xs'],
    color: color['--color-fg'],
  },
  gist: { margin: 0, fontWeight: 500 },
  tabs: {
    display: 'flex',
    gap: 2,
    padding: 2,
    borderRadius: radius['--radius-md'],
    backgroundColor: color['--color-subtle'],
  },
  tab: {
    flexGrow: 1,
    minHeight: { default: null, [media.coarse]: 44 },
    paddingBlock: 4,
    paddingInline: space['--space-2'],
    borderWidth: 0,
    borderRadius: radius['--radius-sm'],
    backgroundColor: 'transparent',
    fontFamily: font['--font-mono'],
    fontSize: text['--text-2xs'],
    color: color['--color-fg-muted'],
    cursor: 'pointer',
  },
  tabOn: {
    backgroundColor: color['--color-surface'],
    color: color['--color-fg'],
    fontWeight: 600,
  },
  yours: { color: color['--color-accent-strong'] },
  reference: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space['--space-1'],
    fontSize: text['--text-xs'],
    color: color['--color-accent-strong'],
  },
});
