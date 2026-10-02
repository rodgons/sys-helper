import * as stylex from '@stylexjs/stylex';
import { useState } from 'react';
import { color, font, radius, space, text } from '../design/tokens.stylex';
import { Button } from './button';

/** A labelled value to send to someone (an account id, a token), in mono with a copy button. */
export function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  // The clipboard API is missing on insecure origins and can reject (permissions), so fall back to a manual copy.
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setFailed(true);
      return;
    }
    setFailed(false);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      <code {...stylex.props(styles.value)}>{value}</code>
      <Button
        size="sm"
        variant="outline"
        aria-label={copied ? 'Copied' : `Copy ${label}`}
        onClick={copy}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
      {failed && (
        <span role="status" {...stylex.props(styles.hint)}>
          Copy failed. Select the {label} and copy it manually.
        </span>
      )}
    </div>
  );
}

const styles = stylex.create({
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space['--space-3'],
    paddingBlock: space['--space-2'],
    paddingInline: space['--space-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-md'],
    backgroundColor: color['--color-subtle'],
  },
  label: {
    fontFamily: font['--font-mono'],
    fontSize: text['--text-2xs'],
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: color['--color-fg-muted'],
  },
  hint: {
    flexBasis: '100%',
    fontSize: text['--text-sm'],
    color: color['--color-fg-muted'],
  },
  value: {
    flexGrow: 1,
    minWidth: 0,
    overflowWrap: 'anywhere',
    fontFamily: font['--font-mono'],
    fontSize: text['--text-sm'],
    color: color['--color-fg'],
  },
});
