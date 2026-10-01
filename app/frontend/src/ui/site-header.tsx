import * as stylex from '@stylexjs/stylex';
import { type ReactNode, useState } from 'react';
import { color, font, layout, media, motion, radius, space, text } from '../design/tokens.stylex';
import { Container } from './layout';

export type NavLink = { href: string; label: string };

/**
 * Sticky top bar: brand left, pill nav links, actions right. Below `md` the links move into a
 * full-width menu with large display-type rows.
 */
export function SiteHeader({
  links,
  currentPath,
  actions,
}: {
  links: NavLink[];
  currentPath: string;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = (href: string) => (href === currentPath ? 'page' : undefined);

  return (
    <header {...stylex.props(styles.header)}>
      <Container xstyle={styles.bar}>
        <a href="/" {...stylex.props(styles.brand)}>
          <span aria-hidden="true" {...stylex.props(styles.mark)} />
          sys-helper
        </a>
        <nav aria-label="Main" {...stylex.props(styles.desktopNav)}>
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              aria-current={current(link.href)}
              {...stylex.props(styles.navLink)}
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div {...stylex.props(styles.actions)}>{actions}</div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
          {...stylex.props(styles.menuButton)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </Container>
      {open && (
        <nav id="mobile-menu" aria-label="Mobile" {...stylex.props(styles.mobileNav)}>
          <Container>
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                aria-current={current(link.href)}
                {...stylex.props(styles.mobileLink)}
              >
                {link.label}
              </a>
            ))}
          </Container>
        </nav>
      )}
    </header>
  );
}

const styles = stylex.create({
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 40,
    backgroundColor: color['--color-canvas'],
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: color['--color-line'],
  },
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: space['--space-6'],
    height: layout['--header-h'],
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: space['--space-2'],
    flexShrink: 0,
    fontFamily: font['--font-display'],
    fontSize: text['--text-xl'],
    fontWeight: 800,
    fontStretch: '75%',
    letterSpacing: '-0.02em',
    textDecoration: 'none',
  },
  mark: {
    width: 22,
    height: 22,
    backgroundColor: color['--color-accent'],
    clipPath: 'polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 0 100%)',
  },
  desktopNav: {
    display: { default: 'none', [media.md]: 'flex' },
    alignItems: 'center',
    gap: space['--space-1'],
  },
  navLink: {
    paddingInline: space['--space-3'],
    paddingBlock: '0.375rem',
    borderRadius: radius['--radius-full'],
    fontSize: text['--text-sm'],
    fontWeight: 500,
    textDecoration: 'none',
    color: {
      default: color['--color-fg-muted'],
      ':hover': color['--color-fg'],
      '[aria-current="page"]': color['--color-fg'],
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': color['--color-subtle'],
      '[aria-current="page"]': color['--color-subtle'],
    },
    transitionProperty: 'background-color, color',
    transitionDuration: motion['--duration'],
  },
  actions: {
    display: { default: 'none', [media.md]: 'flex' },
    alignItems: 'center',
    gap: space['--space-2'],
    marginInlineStart: 'auto',
  },
  menuButton: {
    display: { default: 'inline-flex', [media.md]: 'none' },
    marginInlineStart: 'auto',
    height: 36,
    paddingInline: space['--space-3'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-full'],
    backgroundColor: 'transparent',
    alignItems: 'center',
    fontFamily: font['--font-mono'],
    fontSize: text['--text-xs'],
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    cursor: 'pointer',
  },
  mobileNav: {
    display: { default: 'block', [media.md]: 'none' },
    paddingBottom: space['--space-6'],
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: color['--color-line'],
  },
  mobileLink: {
    display: 'block',
    paddingBlock: space['--space-4'],
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: color['--color-line'],
    fontFamily: font['--font-display'],
    fontSize: '1.75rem',
    fontWeight: 700,
    fontStretch: '75%',
    textDecoration: 'none',
    color: {
      default: color['--color-fg'],
      '[aria-current="page"]': color['--color-accent-strong'],
    },
  },
});
