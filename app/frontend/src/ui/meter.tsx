import * as stylex from '@stylexjs/stylex';
import { color, font, media, radius, space, text } from '../design/tokens.stylex';
import { Label } from './typography';

export type MeterItem = { label: string; value: number; highlight?: boolean };

/**
 * Horizontal bar comparison for presenting a metric against alternatives.
 * Bars are neutral; the `highlight` row takes the accent so the eye lands on it first.
 * Bars are decorative: each value is also printed as text.
 */
export function MeterList({
  label,
  unit,
  items,
}: {
  label: string;
  unit: string;
  items: MeterItem[];
}) {
  const max = Math.max(...items.map((i) => i.value));
  return (
    <figure {...stylex.props(styles.figure)}>
      <figcaption>
        <Label>{label}</Label>
      </figcaption>
      <ul {...stylex.props(styles.list)}>
        {items.map((item) => (
          <li key={item.label} {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.name, item.highlight && styles.nameHighlight)}>
              {item.label}
            </span>
            <div aria-hidden="true" {...stylex.props(styles.track)}>
              <div
                {...stylex.props(
                  styles.bar,
                  item.highlight && styles.barHighlight,
                  styles.width(max > 0 ? (item.value / max) * 100 : 0),
                )}
              />
            </div>
            <span {...stylex.props(styles.value, item.highlight && styles.valueHighlight)}>
              {item.value.toLocaleString('en-US')} {unit}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

const styles = stylex.create({
  figure: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-4'],
    margin: 0,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-3'],
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: {
      default: '5.5rem minmax(0, 1fr) 6.5rem',
      [media.sm]: '7rem minmax(0, 1fr) 8rem',
    },
    alignItems: 'center',
    gap: space['--space-3'],
  },
  name: {
    fontSize: text['--text-sm'],
    color: color['--color-fg-muted'],
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nameHighlight: { color: color['--color-fg'], fontWeight: 600 },
  track: { height: 14 },
  bar: {
    height: '100%',
    minWidth: 2,
    borderRadius: radius['--radius-sm'],
    backgroundColor: color['--color-line'],
  },
  barHighlight: { backgroundColor: color['--color-accent'] },
  width: (pct: number) => ({ width: `${pct}%` }),
  value: {
    fontFamily: font['--font-mono'],
    fontVariantNumeric: 'tabular-nums',
    fontSize: text['--text-xs'],
    textAlign: 'end',
    color: color['--color-fg-muted'],
    whiteSpace: 'nowrap',
  },
  valueHighlight: { color: color['--color-fg'], fontWeight: 700 },
});
