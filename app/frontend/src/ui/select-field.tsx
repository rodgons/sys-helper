import * as stylex from '@stylexjs/stylex';
import { type ComponentProps, useId } from 'react';
import { color, font, media, radius, space, text } from '../design/tokens.stylex';

/** Labelled native select, styled like TextField. */
export function SelectField({
  label,
  hideLabel = false,
  options,
  xstyle,
  ...rest
}: {
  label: string;
  hideLabel?: boolean;
  options: { value: string; label: string }[];
  xstyle?: stylex.StyleXStyles;
} & Omit<ComponentProps<'select'>, 'className' | 'style' | 'id' | 'children'>) {
  const id = useId();
  return (
    <div {...stylex.props(styles.field, xstyle)}>
      <label htmlFor={id} {...stylex.props(hideLabel ? styles.hidden : styles.label)}>
        {label}
      </label>
      <select id={id} {...rest} {...stylex.props(styles.select)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const styles = stylex.create({
  field: { display: 'flex', flexDirection: 'column', gap: space['--space-2'], minWidth: 0 },
  label: {
    fontFamily: font['--font-mono'],
    fontSize: text['--text-xs'],
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: color['--color-fg-muted'],
  },
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
  select: {
    height: 40,
    paddingInline: space['--space-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: {
      default: color['--color-line-strong'],
      ':focus-visible': color['--color-accent'],
    },
    borderRadius: radius['--radius-sm'],
    backgroundColor: color['--color-surface'],
    fontSize: { default: text['--text-sm'], [media.coarse]: text['--text-md'] },
    outline: 'none',
    cursor: 'pointer',
  },
});
