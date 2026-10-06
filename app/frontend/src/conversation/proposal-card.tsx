import * as stylex from '@stylexjs/stylex';
import { describeChange, type Proposal } from '../architecture/proposal';
import type { Review } from '../architecture/review';
import { color, radius, space, text } from '../design/tokens.stylex';
import { PatternText } from '../knowledge/explanation';
import { Badge, type BadgeTone } from '../ui/badge';
import { Button } from '../ui/button';
import { Label, Text } from '../ui/typography';

const STATUS: Record<Proposal['status'], [BadgeTone, string]> = {
  pending: ['accent', 'Pending'],
  accepted: ['success', 'Accepted'],
  rejected: ['danger', 'Rejected'],
  superseded: ['neutral', 'Replaced'],
};

/**
 * A Proposal inside the AI message that made it: its changes in words, its status, and Accept /
 * Reject while it is pending. `review` comes from the canvas, which is where accepting happens.
 */
export function ProposalCard({
  slug,
  proposal,
  review,
}: {
  slug: string;
  proposal: Proposal;
  review: Review | null;
}) {
  const [tone, status] = STATUS[proposal.status];
  const pending = proposal.status === 'pending';
  return (
    <div {...stylex.props(styles.card)}>
      <div {...stylex.props(styles.head)}>
        <Label tone="accent">Proposal #{proposal.seq}</Label>
        <Badge tone={tone}>{status}</Badge>
      </div>
      <Text size="sm">{proposal.summary}</Text>
      <ul {...stylex.props(styles.changes)}>
        {proposal.changes.map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a proposal's changes never reorder
          <li key={i}>
            {describeChange(c, review?.names ?? {}, proposal.changes)}
            {c.op === 'add_decision' && c.pattern && (
              <>
                {' · '}
                <PatternText slug={slug} text={c.pattern} patternId={c.patternId} />
              </>
            )}
          </li>
        ))}
      </ul>
      {pending && review?.stale && (
        <Text size="sm" tone="muted">
          Out of date: {review.stale}. Ask the AI to redo it.
        </Text>
      )}
      {pending && review?.error && (
        <Text size="sm" tone="accent">
          {review.error}
        </Text>
      )}
      {pending && review && (
        <div {...stylex.props(styles.actions)}>
          <Button size="sm" disabled={review.busy || review.stale !== null} onClick={review.accept}>
            Accept
          </Button>
          <Button size="sm" variant="outline" disabled={review.busy} onClick={review.reject}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-2'],
    marginTop: space['--space-2'],
    padding: space['--space-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-md'],
    backgroundColor: color['--color-surface'],
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  changes: {
    margin: 0,
    paddingInlineStart: space['--space-4'],
    fontSize: text['--text-xs'],
    color: color['--color-fg-muted'],
    lineHeight: 1.6,
  },
  actions: { display: 'flex', gap: space['--space-2'] },
});
