import * as stylex from '@stylexjs/stylex';
import { type ReactNode, useState } from 'react';
import { color, font, space, text } from '../design/tokens.stylex';
import { useKnowledge } from '../lib/knowledge';
import { DecisionsPanel } from './decisions';
import { RequirementsPanel } from './requirements-panel';

type Tab = 'conversation' | 'requirements' | 'decisions';

/**
 * The workspace's right pane: tabs for the Conversation, the Requirements and the Decisions. Every
 * tab stays mounted, so switching never loses a draft or interrupts a streaming reply.
 */
export function SidePanel({
  slug,
  names,
  conversation,
}: {
  slug: string;
  names: Record<string, string>;
  conversation: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('conversation');
  const knowledge = useKnowledge(slug);
  const flagged = knowledge.data?.decisions.filter((d) => d.needsReview).length ?? 0;
  const tabs: [Tab, string, number?][] = [
    ['conversation', 'Conversation'],
    ['requirements', 'Requirements', knowledge.data?.requirements.length],
    ['decisions', 'Decisions', knowledge.data?.decisions.length],
  ];

  return (
    <div {...stylex.props(styles.panel)}>
      <div role="tablist" aria-label="Project" {...stylex.props(styles.tabs)}>
        {tabs.map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            {...stylex.props(styles.tab)}
          >
            {label}
            {count ? <span {...stylex.props(styles.count)}> {count}</span> : null}
            {id === 'decisions' && flagged > 0 && (
              <span role="img" aria-label={`${flagged} need review`} {...stylex.props(styles.flag)}>
                {' '}
                ●
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        id="panel-conversation"
        role="tabpanel"
        aria-labelledby="tab-conversation"
        hidden={tab !== 'conversation'}
        {...stylex.props(styles.body, styles.chat)}
      >
        {conversation}
      </div>
      <div
        id="panel-requirements"
        role="tabpanel"
        aria-labelledby="tab-requirements"
        hidden={tab !== 'requirements'}
        {...stylex.props(styles.body, styles.scroll)}
      >
        <RequirementsPanel slug={slug} />
      </div>
      <div
        id="panel-decisions"
        role="tabpanel"
        aria-labelledby="tab-decisions"
        hidden={tab !== 'decisions'}
        {...stylex.props(styles.body, styles.scroll)}
      >
        <DecisionsPanel slug={slug} names={names} />
      </div>
    </div>
  );
}

const styles = stylex.create({
  panel: { display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1 },
  tabs: {
    display: 'flex',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: color['--color-line'],
  },
  tab: {
    flexGrow: 1,
    paddingBlock: space['--space-3'],
    borderWidth: 0,
    borderBottomWidth: 2,
    borderBottomStyle: 'solid',
    borderBottomColor: {
      default: 'transparent',
      '[aria-selected="true"]': color['--color-accent'],
    },
    backgroundColor: 'transparent',
    fontSize: text['--text-sm'],
    fontWeight: { default: 500, '[aria-selected="true"]': 700 },
    color: { default: color['--color-fg-muted'], '[aria-selected="true"]': color['--color-fg'] },
    cursor: 'pointer',
  },
  count: {
    fontFamily: font['--font-mono'],
    fontSize: text['--text-xs'],
    color: color['--color-fg-muted'],
  },
  flag: { color: color['--color-warning'] },
  body: { flexGrow: 1, minHeight: 0, display: { default: 'flex', ':is([hidden])': 'none' } },
  chat: { flexDirection: 'column' },
  scroll: { flexDirection: 'column', overflowY: 'auto', padding: space['--space-4'] },
});
