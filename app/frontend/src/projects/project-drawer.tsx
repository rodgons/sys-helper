import * as stylex from '@stylexjs/stylex';
import { Plus, X } from 'lucide-react';
import { type PointerEvent, useEffect, useId, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { color, font, media, motion, radius, space, text } from '../design/tokens.stylex';
import { slugSuffix, useProjects } from '../lib/projects';
import { setThemeChoice, useThemeChoice } from '../lib/theme';
import { Button } from '../ui/button';
import { Logo } from '../ui/logo';
import { ThemeMenu } from '../ui/theme-menu';
import { Heading } from '../ui/typography';

// How far left a swipe must travel to close the drawer, in px.
const SWIPE_CLOSE_PX = 60;

/**
 * The compact workspace's Project list: a modal native `<dialog>` sliding in from the left (focus
 * trap, Esc). It closes on ✕, a backdrop tap, Esc, a swipe left, picking any Project (the current
 * one included) and any navigation. New project asks the parent to open the new-project dialog.
 * The footer holds the logo (a link home) and the theme menu.
 */
export function ProjectDrawer({
  currentSlug,
  onClose,
  onNewProject,
}: {
  currentSlug: string;
  onClose: () => void;
  onNewProject: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const projects = useProjects();
  const theme = useThemeChoice();
  const { pathname } = useLocation();
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  // Navigation (a Project picked, the logo, New project's result) closes the drawer.
  const opened = useRef(pathname);
  useEffect(() => {
    if (pathname !== opened.current) onClose();
  }, [pathname, onClose]);

  const isCurrent = (slug: string) =>
    slugSuffix(slug) === slugSuffix(currentSlug) ? 'page' : undefined;

  function onPointerDown(e: PointerEvent<HTMLDialogElement>) {
    swipe.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: PointerEvent<HTMLDialogElement>) {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    if (dx < -SWIPE_CLOSE_PX && Math.abs(dx) > Math.abs(e.clientY - start.y)) onClose();
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard way out is Escape, via onCancel.
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click whose target is the <dialog> itself landed on the backdrop, outside the panel.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        swipe.current = null;
      }}
      {...stylex.props(styles.drawer)}
    >
      <div {...stylex.props(styles.panel)}>
        <div {...stylex.props(styles.head)}>
          <Heading as="h2" size="sm" id={titleId}>
            Projects
          </Heading>
          <button
            type="button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            {...stylex.props(styles.iconButton)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Projects" {...stylex.props(styles.list)}>
          {projects.data?.map((p) => (
            <Link
              key={p.slug}
              to={`/p/${p.slug}`}
              aria-current={isCurrent(p.slug)}
              onClick={onClose}
              {...stylex.props(styles.item)}
            >
              {p.name}
            </Link>
          ))}
        </nav>
        <div {...stylex.props(styles.create)}>
          <Button size="sm" variant="outline" onClick={onNewProject}>
            <Plus size={16} aria-hidden="true" />
            New project
          </Button>
        </div>
        <div {...stylex.props(styles.footer)}>
          <Link to="/" onClick={onClose} {...stylex.props(styles.brand)}>
            <Logo size={24} />
            <span>sys-helper</span>
          </Link>
          <ThemeMenu choice={theme} onChange={setThemeChoice} placement="above" />
        </div>
      </div>
    </dialog>
  );
}

const slideIn = stylex.keyframes({
  from: { transform: 'translateX(-100%)' },
  to: { transform: 'translateX(0)' },
});

const styles = stylex.create({
  drawer: {
    boxSizing: 'border-box',
    position: 'fixed',
    insetBlock: 0,
    insetInlineStart: 0,
    insetInlineEnd: 'auto',
    width: 'min(20rem, 85vw)',
    maxWidth: 'none',
    height: '100dvh',
    maxHeight: 'none',
    margin: 0,
    padding: 0,
    borderWidth: 0,
    borderInlineEndWidth: 1,
    borderInlineEndStyle: 'solid',
    borderInlineEndColor: color['--color-line'],
    backgroundColor: color['--color-raised'],
    color: color['--color-fg'],
    animationName: { default: slideIn, [media.reducedMotion]: 'none' },
    animationDuration: '200ms',
    animationTimingFunction: motion['--ease-out'],
    '::backdrop': { backgroundColor: 'rgb(13 11 18 / 0.5)' },
  },
  panel: {
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-3'],
    height: '100%',
    paddingTop: space['--space-3'],
    paddingInline: space['--space-4'],
    paddingBottom: `max(${space['--space-3']}, env(safe-area-inset-bottom))`,
  },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: {
    display: 'grid',
    placeItems: 'center',
    width: 44,
    height: 44,
    marginInlineEnd: `calc(-1 * ${space['--space-2']})`,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius['--radius-full'],
    backgroundColor: { default: 'transparent', ':hover': color['--color-subtle'] },
    color: color['--color-fg-muted'],
    cursor: 'pointer',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space['--space-1'],
    flexGrow: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    minHeight: 48,
    paddingInline: space['--space-3'],
    borderRadius: radius['--radius-sm'],
    fontSize: text['--text-md'],
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: {
      default: color['--color-fg-muted'],
      '[aria-current="page"]': color['--color-fg'],
    },
    backgroundColor: {
      default: 'transparent',
      ':hover': color['--color-subtle'],
      '[aria-current="page"]': color['--color-accent-soft'],
    },
    fontWeight: { default: 400, '[aria-current="page"]': 600 },
  },
  create: { display: 'flex', flexDirection: 'column' },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: space['--space-3'],
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: color['--color-line'],
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: space['--space-2'],
    minHeight: 44,
    fontFamily: font['--font-display'],
    fontSize: text['--text-lg'],
    fontWeight: 800,
    fontStretch: '75%',
    textDecoration: 'none',
  },
});
