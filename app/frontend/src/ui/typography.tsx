import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { color, font, radius, space, text } from '../design/tokens.stylex';

type Common = { children?: ReactNode; xstyle?: stylex.StyleXStyles; id?: string };
type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4';

/** Headline type: condensed, heavy, tight leading. One per section, at most. */
export function Display({
  as: Tag = 'h2',
  size = 'md',
  children,
  xstyle,
  id,
}: Common & { as?: HeadingTag; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <Tag id={id} {...stylex.props(styles.display, displaySizes[size], xstyle)}>
      {children}
    </Tag>
  );
}

/** Workhorse heading for cards and subsections, set in the body family. */
export function Heading({
  as: Tag = 'h3',
  size = 'md',
  children,
  xstyle,
  id,
}: Common & { as?: HeadingTag; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <Tag id={id} {...stylex.props(styles.heading, headingSizes[size], xstyle)}>
      {children}
    </Tag>
  );
}

export function Text({
  as: Tag = 'p',
  size = 'md',
  tone = 'default',
  children,
  xstyle,
  id,
}: Common & {
  as?: 'p' | 'span' | 'div';
  size?: 'sm' | 'md' | 'lg';
  tone?: 'default' | 'muted' | 'faint' | 'accent';
}) {
  return (
    <Tag id={id} {...stylex.props(textSizes[size], tones[tone], xstyle)}>
      {children}
    </Tag>
  );
}

/** Small uppercase mono label that introduces a section or names a field. */
export function Label({
  as: Tag = 'p',
  tone = 'faint',
  children,
  xstyle,
  id,
}: Common & { as?: 'p' | 'span' | 'div' | 'h2' | 'h3'; tone?: 'faint' | 'accent' }) {
  return (
    <Tag id={id} {...stylex.props(styles.label, tones[tone], xstyle)}>
      {children}
    </Tag>
  );
}

/** Mono, tabular figures for numbers that get compared: metrics, timings, versions. */
export function Readout({ children, xstyle }: Common) {
  return <span {...stylex.props(styles.readout, xstyle)}>{children}</span>;
}

export function InlineCode({ children }: Common) {
  return <code {...stylex.props(styles.code)}>{children}</code>;
}

const styles = stylex.create({
  display: {
    fontFamily: font['--font-display'],
    fontWeight: 800,
    fontStretch: '75%',
    letterSpacing: '-0.025em',
    lineHeight: 0.95,
    color: color['--color-fg'],
  },
  heading: {
    fontWeight: 700,
    letterSpacing: '-0.015em',
    lineHeight: 1.25,
    color: color['--color-fg'],
  },
  label: {
    fontFamily: font['--font-mono'],
    fontSize: text['--text-2xs'],
    fontWeight: 500,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    lineHeight: 1.4,
  },
  readout: {
    fontFamily: font['--font-mono'],
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.01em',
  },
  code: {
    fontFamily: font['--font-mono'],
    fontSize: '0.875em',
    paddingInline: space['--space-1'],
    paddingBlock: '0.1em',
    borderRadius: radius['--radius-sm'],
    backgroundColor: color['--color-subtle'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
  },
});

const displaySizes = stylex.create({
  sm: { fontSize: text['--text-display-sm'] },
  md: { fontSize: text['--text-display-md'] },
  lg: { fontSize: text['--text-display-lg'] },
});

const headingSizes = stylex.create({
  sm: { fontSize: text['--text-md'] },
  md: { fontSize: text['--text-xl'] },
  lg: { fontSize: text['--text-2xl'] },
});

const textSizes = stylex.create({
  sm: { fontSize: text['--text-sm'], lineHeight: 1.5 },
  md: { fontSize: text['--text-md'], lineHeight: 1.6 },
  lg: { fontSize: text['--text-lg'], lineHeight: 1.6, maxWidth: '62ch' },
});

const tones = stylex.create({
  default: { color: color['--color-fg'] },
  muted: { color: color['--color-fg-muted'] },
  faint: { color: color['--color-fg-faint'] },
  accent: { color: color['--color-accent-strong'] },
});
