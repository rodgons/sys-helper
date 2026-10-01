import * as stylex from '@stylexjs/stylex';
import { type ComponentProps, useId } from 'react';
import { color, font, motion, radius, space, text } from '../design/tokens.stylex';

/** Labelled multi-line input, styled like TextField. */
export function TextArea({
  label,
  hideLabel = false,
  xstyle,
  ...rest
}: { label: string; hideLabel?: boolean; xstyle?: stylex.StyleXStyles } & Omit<
  ComponentProps<'textarea'>,
  'className' | 'style' | 'id'
>) {
  const id = useId();
  return (
    <div {...stylex.props(styles.field, xstyle)}>
      <label htmlFor={id} {...stylex.props(hideLabel ? styles.hidden : styles.label)}>
        {label}
      </label>
      <textarea id={id} rows={3} {...rest} {...stylex.props(styles.input)} />
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
  input: {
    resize: 'vertical',
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
});
