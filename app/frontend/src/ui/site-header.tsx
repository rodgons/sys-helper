import * as stylex from '@stylexjs/stylex';
import { type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { color, font, layout, media, motion, radius, space, text } from '../design/tokens.stylex';
import { Container } from './layout';
import { Logo } from './logo';

export type NavLink = { href: string; label: string };

/**
 * Sticky top bar: brand left, pill nav links, then `tools` and `actions` right. Below `md` the
 * links move into a full-width menu with large display-type rows. `tools` (e.g. the theme switch)
 * and `actions` (the avatar or Sign in) show at every width. Without links there is neither nav
 * nor menu.
 */
export function SiteHeader({
  links,
  currentPath,
  tools,
  actions,
}: {
  links: NavLink[];
  currentPath: string;
  tools?: ReactNode;
  actions?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const current = (href: string) => (href === currentPath ? 'page' : undefined);
  const hasLinks = links.length > 0;

  return (
    <header {...stylex.props(styles.header)}>
      <Container xstyle={styles.bar}>
        <Link to="/" {...stylex.props(styles.brand)}>
          <Logo size={28} />
          <span>
            sys-<span {...stylex.props(styles.brandAccent)}>helper</span>
          </span>
        </Link>
        {hasLinks && (
          <nav aria-label="Main" {...stylex.props(styles.desktopNav)}>
            {links.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                aria-current={current(link.href)}
                {...stylex.props(styles.navLink)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
        <div {...stylex.props(styles.end)}>
          {tools}
          <div {...stylex.props(styles.actions)}>{actions}</div>
        </div>
        {hasLinks && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
            {...stylex.props(styles.menuButton)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
        )}
      </Container>
      {hasLinks && open && (
        <nav id="mobile-menu" aria-label="Mobile" {...stylex.props(styles.mobileNav)}>
          <Container>
            {links.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                aria-current={current(link.href)}
                onClick={() => setOpen(false)}
                {...stylex.props(styles.mobileLink)}
              >
                {link.label}
              </Link>
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
    // Full width, so the brand and the actions sit at the window's edges, not the page column's.
    maxWidth: 'none',
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
  brandAccent: {
    color: color['--color-accent-strong'],
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
  end: {
    display: 'flex',
    alignItems: 'center',
    gap: space['--space-2'],
    marginInlineStart: 'auto',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: space['--space-2'],
  },
  menuButton: {
    display: { default: 'inline-flex', [media.md]: 'none' },
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
