import * as stylex from '@stylexjs/stylex';
import type { LucideIcon } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { color, motion, radius, space, text } from '../design/tokens.stylex';

const CloseMenu = createContext<() => void>(() => {});

/**
 * Dropdown menu behind a button (`trigger` is its visible content, `label` its accessible name).
 * It opens below the button, aligned right, focuses the first item, and closes on Escape, on a
 * click outside or after an item runs.
 */
export function Menu({
  label,
  trigger,
  children,
  xstyle,
}: {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  xstyle?: stylex.StyleXStyles;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div ref={rootRef} {...stylex.props(styles.root)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        {...stylex.props(styles.trigger, xstyle)}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={(e) => e.key === 'Escape' && close()}
          {...stylex.props(styles.menu)}
        >
          <CloseMenu.Provider value={close}>{children}</CloseMenu.Provider>
        </div>
      )}
    </div>
  );
}

/** One action in a Menu, with an optional decorative icon on its left. */
export function MenuItem({
  icon: Icon,
  onSelect,
  children,
}: {
  icon?: LucideIcon;
  onSelect: () => void;
  children: ReactNode;
}) {
  const close = useContext(CloseMenu);
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        close();
        onSelect();
      }}
      {...stylex.props(styles.item)}
    >
      {Icon && (
        <Icon size={16} strokeWidth={1.75} aria-hidden="true" {...stylex.props(styles.icon)} />
      )}
      {children}
    </button>
  );
}

/** Non-interactive text atop a Menu, such as who is signed in. Arrow keys and focus skip it. */
export function MenuHeader({ children }: { children: ReactNode }) {
  return (
    <div role="none" {...stylex.props(styles.header)}>
      {children}
    </div>
  );
}

/** A rule between groups of Menu items, e.g. before Sign out. */
export function MenuSeparator() {
  return <hr {...stylex.props(styles.separator)} />;
}

const styles = stylex.create({
  root: { position: 'relative', display: 'inline-flex' },
  trigger: {
    display: 'inline-flex',
    padding: 0,
    borderWidth: 0,
    borderRadius: radius['--radius-full'],
    backgroundColor: 'transparent',
    cursor: 'pointer',
    outlineOffset: 2,
  },
  menu: {
    position: 'absolute',
    top: `calc(100% + ${space['--space-2']})`,
    right: 0,
    zIndex: 50,
    minWidth: '10rem',
    display: 'flex',
    flexDirection: 'column',
    padding: space['--space-1'],
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: color['--color-line'],
    borderRadius: radius['--radius-lg'],
    backgroundColor: color['--color-raised'],
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: space['--space-2'],
    paddingInline: space['--space-3'],
    paddingBlock: space['--space-2'],
    borderWidth: 0,
    borderRadius: radius['--radius-md'],
    backgroundColor: {
      default: 'transparent',
      ':hover': color['--color-subtle'],
      ':focus-visible': color['--color-subtle'],
    },
    color: color['--color-fg'],
    fontSize: text['--text-sm'],
    textAlign: 'start',
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: motion['--duration'],
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    paddingInline: space['--space-3'],
    paddingBlock: space['--space-2'],
    fontSize: text['--text-sm'],
    color: color['--color-fg'],
    fontWeight: 600,
    overflowWrap: 'anywhere',
  },
  icon: { flexShrink: 0, color: color['--color-fg-muted'] },
  separator: {
    marginBlock: space['--space-2'],
    marginInline: 0,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopStyle: 'solid',
    borderTopColor: color['--color-line'],
  },
});
