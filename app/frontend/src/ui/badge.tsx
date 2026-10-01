import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { color, font, radius, space, text } from '../design/tokens.stylex';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

/** Compact mono status tag. Status hues tint a hairline border and text, never a solid fill. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children?: ReactNode }) {
  return <span {...stylex.props(styles.badge, tones[tone])}>{children}</span>;
}

const styles = stylex.create({
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space['--space-1'],
    height: 22,
    paddingInline: space['--space-2'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: radius['--radius-sm'],
    fontFamily: font['--font-mono'],
    fontSize: text['--text-2xs'],
    fontWeight: 500,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  },
});

const tones = stylex.create({
  neutral: {
    color: color['--color-fg-muted'],
    borderColor: color['--color-line'],
    backgroundColor: color['--color-subtle'],
  },
  accent: {
    color: color['--color-accent-strong'],
    borderColor: `color-mix(in srgb, ${color['--color-accent']} 40%, transparent)`,
    backgroundColor: color['--color-accent-soft'],
  },
  success: {
    color: color['--color-success'],
    borderColor: `color-mix(in srgb, ${color['--color-success']} 40%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${color['--color-success']} 8%, transparent)`,
  },
  warning: {
    color: color['--color-warning'],
    borderColor: `color-mix(in srgb, ${color['--color-warning']} 40%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${color['--color-warning']} 8%, transparent)`,
  },
  danger: {
    color: color['--color-danger'],
    borderColor: `color-mix(in srgb, ${color['--color-danger']} 40%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${color['--color-danger']} 8%, transparent)`,
  },
  info: {
    color: color['--color-info'],
    borderColor: `color-mix(in srgb, ${color['--color-info']} 40%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${color['--color-info']} 8%, transparent)`,
  },
});
