import * as stylex from '@stylexjs/stylex';
import { useEffect, useRef, useState } from 'react';
import { color, font, motion, radius, space, text } from '../design/tokens.stylex';
import { useMessages, useSendMessage } from '../lib/conversation';
import { Button } from '../ui/button';
import { Heading, Text } from '../ui/typography';

const MAX_LENGTH = 4000;

/** Right pane of the workspace: the Project's Conversation and a composer. */
export function ChatPane({ slug }: { slug: string }) {
  const messages = useMessages(slug);
  const send = useSendMessage(slug);
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const count = messages.data?.length ?? 0;

  // Keep the newest message in view.
  useEffect(() => {
    if (count > 0 && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [count]);

  const canSend = draft.trim() !== '' && !send.isPending;
  const submit = () => {
    if (!canSend) return;
    send.mutate(draft.trim(), { onSuccess: () => setDraft('') });
  };

  return (
    <div {...stylex.props(styles.pane)}>
      <div {...stylex.props(styles.head)}>
        <Heading as="h2" size="sm">
          Conversation
        </Heading>
      </div>

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
            <p {...stylex.props(styles.body)}>{m.body}</p>
          </li>
        ))}
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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter adds a line. Ignore Enter while an IME is composing.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          {...stylex.props(styles.input)}
        />
        <div {...stylex.props(styles.actions)}>
          <Text size="sm" tone={send.isError ? 'accent' : 'faint'}>
            {send.isError
              ? "Couldn't send your message. Try again."
              : 'AI replies are coming soon. Your messages are saved.'}
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
  head: {
    paddingInline: space['--space-4'],
    paddingBlock: space['--space-4'],
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: color['--color-line'],
  },
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
