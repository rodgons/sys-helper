import * as stylex from '@stylexjs/stylex';
import type { ComponentProps, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { color, media, motion, radius, space, text } from '../design/tokens.stylex';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';
type StyleProps = {
  variant?: Variant;
  size?: Size;
  children?: ReactNode;
  xstyle?: stylex.StyleXStyles;
};

/**
 * Chamfered button: square body with the top-right corner cut off.
 * primary = accent fill · secondary = inverted (fg fill) · outline = hairline · ghost = text only.
 * Fills swap on hover (accent ↔ fg) instead of darkening, so hover is always visible.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  children,
  xstyle,
  ...rest
}: StyleProps & Omit<ComponentProps<'button'>, 'size' | 'className'>) {
  return (
    <button type={type} {...rest} {...buttonProps(variant, size, xstyle)}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  children,
  xstyle,
  ...rest
}: StyleProps & Omit<ComponentProps<'a'>, 'size' | 'className'>) {
  return (
    <a {...rest} {...buttonProps(variant, size, xstyle)}>
      {children}
    </a>
  );
}

/** A Button-styled link to another route of the app (client-side navigation). */
export function ButtonRouteLink({
  variant = 'primary',
  size = 'md',
  children,
  xstyle,
  ...rest
}: StyleProps & Omit<LinkProps, 'className' | 'style'>) {
  return (
    <Link {...rest} {...buttonProps(variant, size, xstyle)}>
      {children}
    </Link>
  );
}

function buttonProps(variant: Variant, size: Size, xstyle?: stylex.StyleXStyles) {
  return stylex.props(
    styles.base,
    variant !== 'ghost' && styles.cut,
    variants[variant],
    sizes[size],
    xstyle,
  );
}

const CUT = `polygon(0 0, calc(100% - ${radius['--cut']}) 0, 100% ${radius['--cut']}, 100% 100%, 0 100%)`;

const styles = stylex.create({
  base: {
    position: 'relative',
    isolation: 'isolate',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space['--space-2'],
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: 0,
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    cursor: { default: 'pointer', ':disabled': 'not-allowed' },
    opacity: { default: 1, ':disabled': 0.45 },
    transitionProperty: 'background-color, color',
    transitionDuration: motion['--duration'],
    transitionTimingFunction: motion['--ease-out'],
    userSelect: 'none',
  },
  cut: {
    clipPath: CUT,
    // clip-path also clips the focus outline, so draw focus inside the shape.
    outlineOffset: { default: null, ':focus-visible': '-4px' },
    outlineColor: { default: null, ':focus-visible': color['--color-canvas'] },
  },
});

const variants = stylex.create({
  primary: {
    backgroundColor: {
      default: color['--color-accent'],
      ':hover:not(:disabled)': color['--color-fg'],
    },
    color: {
      default: color['--color-on-accent'],
      ':hover:not(:disabled)': color['--color-canvas'],
    },
  },
  secondary: {
    backgroundColor: {
      default: color['--color-fg'],
      ':hover:not(:disabled)': color['--color-accent'],
    },
    color: {
      default: color['--color-canvas'],
      ':hover:not(:disabled)': color['--color-on-accent'],
    },
  },
  // The fg-colored element is the border; ::before paints the inner canvas with the same cut.
  // On hover the inner fill disappears, so the button inverts.
  outline: {
    backgroundColor: color['--color-fg'],
    color: { default: color['--color-fg'], ':hover:not(:disabled)': color['--color-canvas'] },
    '::before': {
      content: '""',
      position: 'absolute',
      inset: '1.5px',
      zIndex: -1,
      clipPath: `polygon(0 0, calc(100% - ${radius['--cut']} + 0.62px) 0, 100% calc(${radius['--cut']} - 0.62px), 100% 100%, 0 100%)`,
      backgroundColor: color['--color-canvas'],
      opacity: { default: 1, ':hover': 0 },
      transitionProperty: 'opacity',
      transitionDuration: motion['--duration'],
    },
  },
  ghost: {
    backgroundColor: { default: 'transparent', ':hover:not(:disabled)': color['--color-subtle'] },
    color: { default: color['--color-fg-muted'], ':hover:not(:disabled)': color['--color-fg'] },
    borderRadius: radius['--radius-full'],
  },
});

const sizes = stylex.create({
  sm: {
    height: { default: 32, [media.coarse]: 44 },
    paddingInline: space['--space-3'],
    fontSize: text['--text-sm'],
  },
  md: {
    height: 42,
    paddingInline: space['--space-5'],
    fontSize: text['--text-sm'],
  },
  lg: {
    height: 52,
    paddingInline: space['--space-8'],
    fontSize: text['--text-md'],
  },
});
