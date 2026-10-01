import * as stylex from '@stylexjs/stylex';
import type { ComponentProps, ReactNode } from 'react';
import { color, motion, text } from '../design/tokens.stylex';

type AnchorProps = Omit<ComponentProps<'a'>, 'className'> & {
  children?: ReactNode;
  xstyle?: stylex.StyleXStyles;
};

/**
 * Inline link inside running text. `subtle` keeps the color of the text and only
 * reveals its underline on hover; `accent` is always underlined in the accent color.
 */
export function TextLink({
  tone = 'accent',
  children,
  xstyle,
  ...rest
}: AnchorProps & { tone?: 'accent' | 'subtle' }) {
  return (
    <a
      {...rest}
      {...stylex.props(styles.text, tone === 'accent' ? styles.accent : styles.subtle, xstyle)}
    >
      {children}
    </a>
  );
}

/** Standalone call-to-action link ("Read more →"): heavy underline that inverts into a block on hover. */
export function ArrowLink({ children, xstyle, ...rest }: AnchorProps) {
  return (
    <a {...rest} {...stylex.props(styles.arrow, xstyle)}>
      {children}
      <span aria-hidden="true">→</span>
    </a>
  );
}

const styles = stylex.create({
  text: {
    textDecorationLine: 'underline',
    textUnderlineOffset: '0.25em',
    textDecorationThickness: '1px',
    transitionProperty: 'color, text-decoration-color',
    transitionDuration: motion['--duration'],
  },
  accent: {
    color: { default: color['--color-accent-strong'], ':hover': color['--color-fg'] },
    textDecorationColor: { default: 'currentColor', ':hover': color['--color-fg'] },
  },
  subtle: {
    color: 'inherit',
    fontWeight: 500,
    textDecorationColor: { default: 'transparent', ':hover': color['--color-line-strong'] },
  },
  arrow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.375em',
    paddingInline: 2,
    fontSize: text['--text-sm'],
    fontWeight: 600,
    color: { default: color['--color-fg'], ':hover': color['--color-canvas'] },
    backgroundColor: { default: 'transparent', ':hover': color['--color-fg'] },
    textDecorationLine: 'underline',
    textDecorationThickness: '1.5px',
    textUnderlineOffset: '5px',
    textDecorationColor: { default: color['--color-fg'], ':hover': 'transparent' },
  },
});
