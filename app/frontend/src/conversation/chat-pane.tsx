import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import type { Review } from '../architecture/review';
import { color, font, motion, radius, space, text } from '../design/tokens.stylex';
import { ApiError } from '../lib/api';
import { useMessages, useReply, useSendMessage } from '../lib/conversation';
import { Button } from '../ui/button';
import { Text } from '../ui/typography';
import { Markdown } from './markdown';
import { ProposalCard } from './proposal-card';

const MAX_LENGTH = 4000;

const REPLY_ERRORS: Record<string, string> = {
  ai_unavailable: "The AI isn't set up on this server yet.",
  busy: 'The AI is already answering this project in another tab.',
};

/** Right pane of the workspace: the Project's Conversation and a composer. */
export function ChatPane({ slug, review = null }: { slug: string; review?: Review | null }) {
  const messages = useMessages(slug);
  const send = useSendMessage(slug);
  const reply = useReply(slug);
  const [draft, setDraft] = useState('');
  // Which of the User's sent messages the draft shows, counting back from the newest (0), like a
  // shell's history. null when the draft is the User's own text.
  const [recalled, setRecalled] = useState<number | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const count = messages.data?.length ?? 0;
  const streamed = reply.state.status === 'streaming' ? reply.state.text : '';
  const replying = reply.state.status === 'streaming';
  const last = messages.data?.at(-1);
  const pendingSeq = last?.proposal?.status === 'pending' ? last.proposal.seq : undefined;
  const reviewedSeq =
    last?.proposal?.status === 'accepted' || last?.proposal?.status === 'rejected'
      ? last.proposal.seq
      : undefined;
  // The AI follows up on a User message, and on its own Proposal once the User reviews it.
  const unanswered = last?.role === 'user' || reviewedSeq !== undefined;

  // When the User accepts or rejects the Proposal ending the Conversation, the AI continues right
  // away. A review from before this page loaded only gets the "Get a reply" button.
  const watchedSeq = useRef<number | undefined>(undefined);
  const { start } = reply;
  useEffect(() => {
    if (pendingSeq !== undefined) {
      watchedSeq.current = pendingSeq;
    } else if (reviewedSeq !== undefined && reviewedSeq === watchedSeq.current) {
      watchedSeq.current = undefined;
      void start();
    }
  }, [pendingSeq, reviewedSeq, start]);

  // Keep the newest message (or the reply being written) in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll whenever either changes
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [count, streamed]);

  const canSend = draft.trim() !== '' && !send.isPending && !replying;
  const submit = () => {
    if (!canSend) return;
    send.mutate(draft.trim(), {
      onSuccess: () => {
        setDraft('');
        setRecalled(null);
        void reply.start();
      },
    });
  };
  // Up and Down step through the User's sent messages, but only while the draft is empty or still
  // an unedited recalled message, so they keep moving the caret in text being written.
  const sent = (messages.data ?? []).filter((m) => m.role === 'user').map((m) => m.body);
  const recall = (step: 1 | -1) => {
    const index = (recalled ?? -1) + step;
    if (index >= sent.length) return;
    setRecalled(index < 0 ? null : index);
    setDraft(index < 0 ? '' : (sent[sent.length - 1 - index] ?? ''));
  };
  const browsing = recalled === null ? draft === '' : draft === sent[sent.length - 1 - recalled];

  const sendError =
    send.error instanceof ApiError && send.error.code === 'daily_limit'
      ? "You've reached today's message limit. It resets at midnight UTC."
      : "Couldn't send your message. Try again.";

  return (
    <div {...stylex.props(styles.pane)}>
      <ol ref={list} aria-label="Messages" {...stylex.props(styles.list)}>
        {messages.isError && (
          <li>
            <Text size="sm" tone="muted">
              Couldn't load the conversation. Refresh to try again.
            </Text>
          </li>
        )}
        {messages.data?.map((m, i) => (
          <li
            // Messages are only ever appended, so their position is a stable key.
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only list
            key={i}
            {...stylex.props(styles.message, m.role === 'user' ? styles.fromUser : styles.fromAi)}
          >
            <span {...stylex.props(styles.author)}>
              {m.role === 'user' ? 'You' : 'AI architect'}
            </span>
            {m.role === 'user' ? (
              <p {...stylex.props(styles.body)}>{m.body}</p>
            ) : (
              <Markdown>{m.body}</Markdown>
            )}
            {m.proposal && (
              <ProposalCard
                proposal={m.proposal}
                review={review?.seq === m.proposal.seq ? review : null}
              />
            )}
          </li>
        ))}
        {replying && (
          <li aria-busy="true" {...stylex.props(styles.message, styles.fromAi)}>
            <span {...stylex.props(styles.author)}>AI architect</span>
            {streamed === '' ? (
              <p {...stylex.props(styles.body, styles.thinking)}>Thinking…</p>
            ) : (
              <Markdown>{streamed}</Markdown>
            )}
          </li>
        )}
        {!replying && unanswered && (
          <li {...stylex.props(styles.notice)}>
            <Text size="sm" tone="muted">
              {reply.state.status === 'failed'
                ? (REPLY_ERRORS[reply.state.code] ?? "The AI couldn't reply.")
                : reviewedSeq !== undefined
                  ? "The AI hasn't followed up on this proposal yet."
                  : 'This message has no reply yet.'}
            </Text>
            <Button size="sm" variant="outline" onClick={() => void reply.start()}>
              {reply.state.status === 'failed' ? 'Retry' : 'Get a reply'}
            </Button>
          </li>
        )}
      </ol>

      <form
        {...stylex.props(styles.composer)}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="chat-message" {...stylex.props(styles.srOnly)}>
          Message
        </label>
        <textarea
          id="chat-message"
          rows={3}
          maxLength={MAX_LENGTH}
          placeholder="Describe your system or ask a question…"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setRecalled(null);
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter adds a line. Ignore Enter while an IME is composing.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
            const plain = !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && plain && browsing) {
              e.preventDefault();
              recall(e.key === 'ArrowUp' ? 1 : -1);
            }
          }}
          {...stylex.props(styles.input)}
        />
        <div {...stylex.props(styles.actions)}>
          <Text size="sm" tone={send.isError ? 'accent' : 'faint'}>
            {send.isError ? sendError : 'Enter to send · Shift+Enter for a new line'}
          </Text>
          <Button type="submit" size="sm" disabled={!canSend}>
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}

const styles = stylex.create({
  pane: { display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1 },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-4'],
    flexGrow: 1,
    minHeight: 0,
    overflowY: 'auto',
    margin: 0,
    padding: space['--space-4'],
    listStyle: 'none',
  },
  message: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-1'],
    maxWidth: '92%',
    paddingInline: space['--space-3'],
    paddingBlock: space['--space-2'],
    borderRadius: radius['--radius-md'],
  },
  fromAi: { alignSelf: 'flex-start', backgroundColor: color['--color-subtle'] },
  fromUser: { alignSelf: 'flex-end', backgroundColor: color['--color-accent-soft'] },
  author: {
    fontFamily: font['--font-mono'],
    fontSize: '0.625rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: color['--color-fg-muted'],
  },
  body: {
    margin: 0,
    fontSize: text['--text-sm'],
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
  thinking: { color: color['--color-fg-muted'], fontStyle: 'italic' },
  notice: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space['--space-3'],
    paddingInline: space['--space-3'],
    paddingBlock: space['--space-2'],
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color['--color-line-strong'],
    borderRadius: radius['--radius-md'],
  },
  composer: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-2'],
    padding: space['--space-4'],
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: color['--color-line'],
  },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
  input: {
    resize: 'none',
    padding: space['--space-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: color['--color-line-strong'],
      ':focus-visible': color['--color-accent'],
    },
    borderRadius: radius['--radius-sm'],
    backgroundColor: color['--color-surface'],
    fontSize: text['--text-sm'],
    lineHeight: 1.5,
    outline: 'none',
    boxShadow: { default: 'none', ':focus-visible': `0 0 0 3px ${color['--color-accent-soft']}` },
    transitionProperty: 'border-color, box-shadow',
    transitionDuration: motion['--duration'],
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space['--space-3'],
  },
});
