import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { color, media, motion, radius, space } from '../design/tokens.stylex';

/**
 * Flat surface separated by a hairline, never by a shadow. With `href` the whole card is a
 * link and its border darkens on hover.
 */
export function Card({
  href,
  tone = 'surface',
  padding = 'md',
  children,
  xstyle,
}: {
  href?: string;
  tone?: 'surface' | 'subtle' | 'slab';
  padding?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  xstyle?: stylex.StyleXStyles;
}) {
  const props = stylex.props(
    styles.card,
    tones[tone],
    paddings[padding],
    href !== undefined && styles.interactive,
    xstyle,
  );
  return href !== undefined ? (
    <a href={href} {...props}>
      {children}
    </a>
  ) : (
    <div {...props}>{children}</div>
  );
}

const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-3'],
    minWidth: 0,
    borderWidth: 1,
    borderStyle: 'solid',
    borderRadius: radius['--radius-xl'],
    textDecoration: 'none',
    color: 'inherit',
  },
  interactive: {
    borderColor: { default: color['--color-line'], ':hover': color['--color-line-strong'] },
    transitionProperty: 'border-color',
    transitionDuration: motion['--duration'],
  },
});

const tones = stylex.create({
  surface: { backgroundColor: color['--color-surface'], borderColor: color['--color-line'] },
  subtle: { backgroundColor: color['--color-subtle'], borderColor: color['--color-line'] },
  slab: {
    backgroundColor: color['--color-slab'],
    borderColor: color['--color-slab'],
    color: color['--color-on-slab'],
  },
});

const paddings = stylex.create({
  sm: { padding: space['--space-4'] },
  md: { padding: space['--space-6'] },
  lg: { padding: { default: space['--space-6'], [media.md]: space['--space-10'] } },
});
