import * as stylex from '@stylexjs/stylex';
import type { ReactNode } from 'react';
import { color, layout, media, space } from '../design/tokens.stylex';

type Gap = 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16;
type Common = { children?: ReactNode; xstyle?: stylex.StyleXStyles };

/** Centers content at the container width with the fluid page gutter. */
export function Container({
  size = 'default',
  as: Tag = 'div',
  children,
  xstyle,
}: Common & { size?: 'default' | 'narrow'; as?: 'div' | 'header' | 'footer' | 'main' }) {
  return (
    <Tag {...stylex.props(styles.container, size === 'narrow' && styles.narrow, xstyle)}>
      {children}
    </Tag>
  );
}

/**
 * A page band with fluid vertical rhythm. `ruled` draws the hairline that separates
 * stacked sections instead of alternating background colors.
 */
export function Section({
  ruled = false,
  children,
  xstyle,
  ...rest
}: Common & { ruled?: boolean; id?: string; 'aria-labelledby'?: string }) {
  return (
    <section {...rest} {...stylex.props(styles.section, ruled && styles.ruled, xstyle)}>
      <Container>{children}</Container>
    </section>
  );
}

/** Vertical (or horizontal) flow with a gap from the spacing scale. */
export function Stack({
  gap = 4,
  direction = 'column',
  align,
  children,
  xstyle,
}: Common & {
  gap?: Gap;
  direction?: 'column' | 'row';
  align?: 'start' | 'center' | 'end' | 'baseline';
}) {
  return (
    <div
      {...stylex.props(
        styles.flex,
        direction === 'row' ? styles.row : styles.column,
        gaps[gap],
        align && aligns[align],
        xstyle,
      )}
    >
      {children}
    </div>
  );
}

/** Horizontal row that wraps on narrow screens (button groups, tags, toolbars). */
export function Cluster({
  gap = 3,
  justify = 'start',
  children,
  xstyle,
}: Common & { gap?: Gap; justify?: 'start' | 'between' | 'end' }) {
  return (
    <div
      {...stylex.props(
        styles.flex,
        styles.row,
        styles.wrap,
        styles.centerItems,
        gaps[gap],
        justifies[justify],
        xstyle,
      )}
    >
      {children}
    </div>
  );
}

/** Mobile-first grid: one column, two from `sm`, `columns` from `lg`. */
export function Grid({
  columns = 3,
  gap = 6,
  children,
  xstyle,
}: Common & { columns?: 2 | 3 | 4; gap?: Gap }) {
  return <div {...stylex.props(styles.grid, gaps[gap], cols[columns], xstyle)}>{children}</div>;
}

const styles = stylex.create({
  container: {
    width: '100%',
    maxWidth: layout['--container'],
    marginInline: 'auto',
    paddingInline: layout['--gutter'],
  },
  narrow: {
    maxWidth: `calc(${layout['--container-narrow']} + 2 * ${layout['--gutter']})`,
  },
  section: {
    paddingBlock: space['--space-section'],
  },
  ruled: {
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: color['--color-line'],
  },
  flex: { display: 'flex' },
  row: { flexDirection: 'row' },
  column: { flexDirection: 'column' },
  wrap: { flexWrap: 'wrap' },
  centerItems: { alignItems: 'center' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
});

const gaps = stylex.create({
  1: { gap: space['--space-1'] },
  2: { gap: space['--space-2'] },
  3: { gap: space['--space-3'] },
  4: { gap: space['--space-4'] },
  6: { gap: space['--space-6'] },
  8: { gap: space['--space-8'] },
  12: { gap: space['--space-12'] },
  16: { gap: space['--space-16'] },
});

const aligns = stylex.create({
  start: { alignItems: 'flex-start' },
  center: { alignItems: 'center' },
  end: { alignItems: 'flex-end' },
  baseline: { alignItems: 'baseline' },
});

const justifies = stylex.create({
  start: { justifyContent: 'flex-start' },
  between: { justifyContent: 'space-between' },
  end: { justifyContent: 'flex-end' },
});

const cols = stylex.create({
  2: {
    gridTemplateColumns: { default: 'minmax(0, 1fr)', [media.sm]: 'repeat(2, minmax(0, 1fr))' },
  },
  3: {
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      [media.sm]: 'repeat(2, minmax(0, 1fr))',
      [media.lg]: 'repeat(3, minmax(0, 1fr))',
    },
  },
  4: {
    gridTemplateColumns: {
      default: 'minmax(0, 1fr)',
      [media.sm]: 'repeat(2, minmax(0, 1fr))',
      [media.lg]: 'repeat(4, minmax(0, 1fr))',
    },
  },
});
