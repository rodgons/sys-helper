import * as stylex from '@stylexjs/stylex';
import { type ReactNode, useState } from 'react';
import { color, font, layout, space, text } from '../design/tokens.stylex';
import { useKnowledge } from '../lib/knowledge';
import { PaneToggle } from '../ui/pane-toggle';
import { DecisionsPanel } from './decisions';
import { RequirementsPanel } from './requirements-panel';

export type PanelTab = 'conversation' | 'requirements' | 'decisions';

/**
 * The workspace's right pane: tabs for the Conversation, the Requirements and the Decisions, and a
 * collapse toggle. Every tab stays mounted, even while the pane is collapsed to a rail, so neither
 * switching nor collapsing loses a draft or interrupts a streaming reply.
 *
 * Passing `tab` makes the active tab controlled (`onTabChange` follows clicks on the tab row).
 * `bare` leaves out the tab row, the collapse toggle and the rail, for a parent that draws its own
 * (the compact layout's bottom sheet); `open: false` then just hides the tab content.
 */
export function SidePanel({
  slug,
  names,
  conversation,
  open,
  onToggle,
  tab: controlled,
  onTabChange,
  bare = false,
}: {
  slug: string;
  names: Record<string, string>;
  conversation: ReactNode;
  open: boolean;
  onToggle?: () => void;
  tab?: PanelTab;
  onTabChange?: (tab: PanelTab) => void;
  bare?: boolean;
}) {
  const [own, setOwn] = useState<PanelTab>('conversation');
  const tab = controlled ?? own;
  const select = (id: PanelTab) => {
    setOwn(id);
    onTabChange?.(id);
  };

  const toggle = onToggle && (
    <PaneToggle side="right" name="chat" open={open} onToggle={onToggle} />
  );

  return (
    <>
      {!bare && !open && <div {...stylex.props(styles.rail)}>{toggle}</div>}
      <div hidden={!open} {...stylex.props(styles.panel)}>
        {!bare && (
          <div {...stylex.props(styles.head)}>
            {toggle}
            <PanelTabs slug={slug} tab={tab} onSelect={select} />
          </div>
        )}
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
    </>
  );
}

/**
 * The side panel's tab row: Conversation, Requirements and Decisions, with the Requirement and
 * Decision counts, a dot on Decisions while some need review, and with `pending`, a dot on the
 * Conversation for a Proposal waiting for review. It controls the SidePanel's tab panels by id.
 */
export function PanelTabs({
  slug,
  tab,
  onSelect,
  pending = false,
}: {
  slug: string;
  tab: PanelTab;
  onSelect: (tab: PanelTab) => void;
  pending?: boolean;
}) {
  const knowledge = useKnowledge(slug);
  const flagged = knowledge.data?.decisions.filter((d) => d.needsReview).length ?? 0;
  const tabs: [PanelTab, string, number?][] = [
    ['conversation', 'Conversation'],
    ['requirements', 'Requirements', knowledge.data?.requirements.length],
    ['decisions', 'Decisions', knowledge.data?.decisions.length],
  ];

  return (
    <div role="tablist" aria-label="Project" {...stylex.props(styles.tabs)}>
      {tabs.map(([id, label, count]) => (
        <button
          key={id}
          type="button"
          role="tab"
          id={`tab-${id}`}
          aria-selected={tab === id}
          aria-controls={`panel-${id}`}
          onClick={() => onSelect(id)}
          {...stylex.props(styles.tab)}
        >
          {label}
          {count ? <span {...stylex.props(styles.count)}> {count}</span> : null}
          {id === 'conversation' && pending && (
            <span role="img" aria-label="Proposal to review" {...stylex.props(styles.pending)}>
              {' '}
              ●
            </span>
          )}
          {id === 'decisions' && flagged > 0 && (
            <span role="img" aria-label={`${flagged} need review`} {...stylex.props(styles.flag)}>
              {' '}
              ●
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

const styles = stylex.create({
  panel: {
    display: { default: 'flex', ':is([hidden])': 'none' },
    flexDirection: 'column',
    minHeight: 0,
    flexGrow: 1,
  },
  rail: { display: 'flex', justifyContent: 'center', paddingBlock: space['--space-4'] },
  head: {
    boxSizing: 'border-box',
    height: layout['--pane-head-h'],
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: space['--space-2'],
    paddingLeft: space['--space-3'],
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: color['--color-line'],
  },
  tabs: { display: 'flex', flexGrow: 1, alignSelf: 'stretch' },
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
  pending: { color: color['--color-accent'] },
  body: { flexGrow: 1, minHeight: 0, display: { default: 'flex', ':is([hidden])': 'none' } },
  chat: { flexDirection: 'column' },
  scroll: { flexDirection: 'column', overflowY: 'auto', padding: space['--space-4'] },
});
