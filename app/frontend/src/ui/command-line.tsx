import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { color, font, motion, radius, space, text } from '../design/tokens.stylex';

/** One-line shell command on a dark slab, with a copy button. */
export function CommandLine({ command, prompt = '$' }: { command: string; prompt?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div {...stylex.props(styles.slab)}>
      <span aria-hidden="true" {...stylex.props(styles.prompt)}>
        {prompt}
      </span>
      <code {...stylex.props(styles.command)}>{command}</code>
      <button
        type="button"
        aria-label={copied ? 'Copied' : 'Copy command'}
        onClick={copy}
        {...stylex.props(styles.copy)}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

const styles = stylex.create({
  slab: {
    display: 'flex',
    alignItems: 'center',
    gap: space['--space-3'],
    minWidth: 0,
    height: 56,
    paddingInlineStart: space['--space-5'],
    paddingInlineEnd: space['--space-2'],
    backgroundColor: color['--color-slab'],
    color: color['--color-on-slab'],
    borderRadius: radius['--radius-md'],
    fontFamily: font['--font-mono'],
    fontSize: text['--text-sm'],
  },
  prompt: {
    color: color['--color-accent-strong'],
    userSelect: 'none',
  },
  command: {
    flexGrow: 1,
    minWidth: 0,
    overflowX: 'auto',
    whiteSpace: 'nowrap',
    scrollbarWidth: 'none',
  },
  copy: {
    flexShrink: 0,
    height: 36,
    paddingInline: space['--space-3'],
    borderWidth: 0,
    borderRadius: radius['--radius-sm'],
    backgroundColor: { default: 'transparent', ':hover': 'rgb(255 255 255 / 0.1)' },
    color: 'inherit',
    fontFamily: font['--font-mono'],
    fontSize: text['--text-xs'],
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: motion['--duration'],
  },
});
