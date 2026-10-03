// PROTOTYPE: throwaway, lives only on the `prototype/mobile-header-drawer` branch.
// Question: below 64rem, what stays in the header, how does the Project drawer open and close,
// and what replaces the "larger screen" notice? The side panel is the docked sheet chosen in the
// bottom-sheet prototype. Three header variants on the real `/p/:slug` route, via `?variant=`:
//   A  Two bars: the site header stays (brand, theme, avatar); a slim Project bar under it has
//      the drawer button, the Project name and a ⋯ menu (Rename, Delete).
//   B  One bar: the site header gives way to a single workspace bar (drawer button, name, ⋯,
//      avatar). The brand and the theme move into the drawer's footer.
//   C  Title is the switcher: one bar (logo, "name ▾", avatar). Tapping the name drops a Project
//      list down from the bar, with this Project's actions and the theme. No side drawer.
// None of them shows the "larger screen" notice: the compact layout replaces it.
// `?kb=scroll|translate|none` picks the iOS keyboard fallback (see useKeyboardViewport).
import {
  Check,
  ChevronDown,
  Menu as MenuIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { Review } from '../architecture/review';
import type { Tab } from '../knowledge/side-panel';
import {
  type Project,
  slugSuffix,
  useDeleteProject,
  useProjects,
  useRenameProject,
} from '../lib/projects';
import { setThemeChoice, useThemeChoice } from '../lib/theme';
import { NewProjectForm } from '../projects/new-project-form';
import { useVariant, VariantSwitcher } from '../prototype/variant-switcher';
import { AccountMenu } from '../root';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import { Logo } from '../ui/logo';
import { Menu, MenuItem } from '../ui/menu';
import { TextField } from '../ui/text-field';
import { ThemeMenu } from '../ui/theme-menu';
import { toast } from '../ui/toaster';

export const VARIANTS: [string, string][] = [
  ['A', 'Two bars'],
  ['B', 'One bar, drawer holds the rest'],
  ['C', 'Title is the switcher'],
];
const KEYS = VARIANTS.map(([k]) => k);

type SheetSlots = {
  canvas: ReactNode;
  /** The side panel; `head: 'none'` hides its own tab row so the sheet can draw one. */
  panel: (tab: Tab, onTab: (t: Tab) => void) => ReactNode;
  pending: boolean;
  review: Review | null;
  counts: { requirements?: number; decisions?: number; flagged: number };
};
export type Slots = SheetSlots & { project: Project };

const COMPACT = '(max-width: 63.99rem)';

export function useCompact() {
  const [compact, setCompact] = useState(() => window.matchMedia(COMPACT).matches);
  useEffect(() => {
    const m = window.matchMedia(COMPACT);
    const on = () => setCompact(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return compact;
}

/** What Root does with the site header on this route: as today, hidden, or with the avatar. */
export function useSiteHeaderMode(pathname: string): 'default' | 'hidden' | 'withAvatar' {
  const compact = useCompact();
  const variant = useVariant(KEYS);
  if (!compact || !pathname.startsWith('/p/')) return 'default';
  // Below `md` the site header hides its actions, and signed-in Users have no links, so there is
  // no menu either: the avatar (and Sign out) is unreachable. Variant A moves it next to the theme.
  return variant === 'A' ? 'withAvatar' : 'hidden';
}

const SITE_HEADER_PX = 64;

export function CompactWorkspace(slots: Slots) {
  const variant = useVariant(KEYS);
  const top = variant === 'A' ? SITE_HEADER_PX : 0;
  const kb = useKeyboardViewport(top);
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  // Picking a Project navigates; the drawer closes with it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes on navigation.
  useEffect(() => setDrawer(false), [pathname]);

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        height: `calc(100dvh - ${top}px)`,
        ...kb.style,
      }}
    >
      <style>{KEYFRAMES}</style>
      {variant === 'A' && <BarA project={slots.project} onDrawer={() => setDrawer(true)} />}
      {variant === 'B' && <BarB project={slots.project} onDrawer={() => setDrawer(true)} />}
      {variant === 'C' && <BarC project={slots.project} open={drawer} onOpen={setDrawer} />}
      <DockedSheet {...slots} />
      {variant !== 'C' && (
        <ProjectDrawer
          current={slots.project.slug}
          open={drawer}
          onClose={() => setDrawer(false)}
          footer={variant === 'B'}
        />
      )}
      <VariantSwitcher variants={VARIANTS} />
      <StateReadout variant={variant} kb={kb.mode} pending={slots.pending} drawer={drawer} />
    </main>
  );
}

const KEYFRAMES = `
@keyframes proto-slide-in { from { transform: translateX(-100%) } to { transform: none } }
@keyframes proto-drop-in { from { transform: translateY(-12px); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes proto-fade-in { from { opacity: 0 } to { opacity: 1 } }
.proto-drawer::backdrop { background: rgb(13 11 18 / 0.5); animation: proto-fade-in 180ms ease-out }
`;

// ─── header bars ────────────────────────────────────────────────────────────

const BAR_H = 56;
const barStyle: React.CSSProperties = {
  boxSizing: 'border-box',
  height: BAR_H,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  paddingInline: 6,
  borderBottom: `1px solid var(--color-line, #e4e2e8)`,
  background: 'var(--color-canvas, #fff)',
};
const nameStyle: React.CSSProperties = {
  flexGrow: 1,
  minWidth: 0,
  margin: 0,
  fontSize: 17,
  fontWeight: 650,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

function IconButton({
  label,
  onClick,
  children,
  expanded,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      onClick={onClick}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        width: 44,
        height: 44,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 8,
        cursor: 'pointer',
        color: 'var(--color-fg)',
      }}
    >
      {children}
    </button>
  );
}

/** A: a slim Project bar under the (kept) site header. */
function BarA({ project, onDrawer }: { project: Project; onDrawer: () => void }) {
  return (
    <div style={{ ...barStyle, height: 48 }}>
      <IconButton label="Projects" onClick={onDrawer}>
        <MenuIcon size={20} aria-hidden="true" />
      </IconButton>
      <h1 style={nameStyle}>{project.name}</h1>
      <ProjectActions project={project} />
    </div>
  );
}

/** B: one bar replacing the site header; the brand and the theme live in the drawer. */
function BarB({ project, onDrawer }: { project: Project; onDrawer: () => void }) {
  return (
    <header style={barStyle}>
      <IconButton label="Projects" onClick={onDrawer}>
        <MenuIcon size={20} aria-hidden="true" />
      </IconButton>
      <h1 style={nameStyle}>{project.name}</h1>
      <ProjectActions project={project} />
      <div style={{ paddingInline: 6, display: 'flex' }}>
        <AccountMenu />
      </div>
    </header>
  );
}

/** C: the Project name is the switcher; a panel drops from the bar. */
function BarC({
  project,
  open,
  onOpen,
}: {
  project: Project;
  open: boolean;
  onOpen: (open: boolean) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [action, setAction] = useState<'rename' | 'delete' | null>(null);
  const theme = useThemeChoice();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpen]);

  return (
    <>
      <header style={{ ...barStyle, position: 'relative', zIndex: 30 }}>
        <Link
          to="/projects"
          aria-label="All projects"
          style={{ display: 'grid', placeItems: 'center', width: 44, height: 44 }}
        >
          <Logo size={26} />
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="proto-switcher"
          onClick={() => onOpen(!open)}
          style={{
            all: 'unset',
            flexGrow: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            height: 44,
            paddingInline: 6,
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          <h1 style={{ ...nameStyle, flexGrow: 0 }}>{project.name}</h1>
          <ChevronDown
            size={18}
            aria-hidden="true"
            style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : undefined }}
          />
        </button>
        <div style={{ paddingInline: 6, display: 'flex' }}>
          <AccountMenu />
        </div>
      </header>
      {open && (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the backdrop; Escape closes too. */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: the backdrop; Escape closes too. */}
          <div
            onClick={() => onOpen(false)}
            style={{
              position: 'absolute',
              inset: `${BAR_H}px 0 0 0`,
              zIndex: 20,
              background: 'rgb(13 11 18 / 0.5)',
              animation: 'proto-fade-in 160ms ease-out',
            }}
          />
          <nav
            id="proto-switcher"
            aria-label="Projects"
            style={{
              position: 'absolute',
              top: BAR_H,
              left: 0,
              right: 0,
              zIndex: 25,
              maxHeight: `calc(100% - ${BAR_H + 48}px)`,
              overflowY: 'auto',
              background: 'var(--color-canvas, #fff)',
              borderBottom: '1px solid var(--color-line)',
              borderRadius: '0 0 14px 14px',
              boxShadow: '0 12px 32px rgba(0,0,0,.2)',
              animation: 'proto-drop-in 180ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <SectionLabel>Projects</SectionLabel>
            <ProjectList current={project.slug} onPick={() => onOpen(false)} />
            <Row onClick={() => setCreating(true)} icon={<Plus size={18} />}>
              New project
            </Row>
            <Divider />
            <SectionLabel>This project</SectionLabel>
            <Row onClick={() => setAction('rename')} icon={<Pencil size={18} />}>
              Rename
            </Row>
            <Row onClick={() => setAction('delete')} icon={<Trash2 size={18} />}>
              Delete
            </Row>
            <Divider />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 16px 12px',
              }}
            >
              <span style={{ fontSize: 15, color: 'var(--color-fg-muted)' }}>Theme</span>
              <ThemeMenu choice={theme} onChange={setThemeChoice} />
            </div>
          </nav>
        </>
      )}
      {creating && (
        <Dialog open onClose={() => setCreating(false)} title="New project">
          <NewProjectForm onCancel={() => setCreating(false)} />
        </Dialog>
      )}
      <ProjectDialogs project={project} action={action} onDone={() => setAction(null)} />
    </>
  );
}

// ─── Project actions (A and B) ──────────────────────────────────────────────

/** ⋯ menu with Rename and Delete; both open a dialog instead of today's inline rename form. */
function ProjectActions({ project }: { project: Project }) {
  const [action, setAction] = useState<'rename' | 'delete' | null>(null);
  return (
    <>
      <Menu label="Project actions" trigger={<MoreHorizontal size={20} aria-hidden="true" />}>
        <MenuItem icon={Pencil} onSelect={() => setAction('rename')}>
          Rename
        </MenuItem>
        <MenuItem icon={Trash2} onSelect={() => setAction('delete')}>
          Delete
        </MenuItem>
      </Menu>
      <ProjectDialogs project={project} action={action} onDone={() => setAction(null)} />
    </>
  );
}

function ProjectDialogs({
  project,
  action,
  onDone,
}: {
  project: Project;
  action: 'rename' | 'delete' | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(project.name);
  const rename = useRenameProject(project.slug);
  const remove = useDeleteProject(project.slug);
  const navigate = useNavigate();
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the field on each open.
  useEffect(() => setName(project.name), [action]);
  return (
    <>
      <Dialog
        open={action === 'rename'}
        onClose={onDone}
        title="Rename project"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={rename.isPending || name.trim() === ''}
              onClick={() =>
                rename.mutate(name, {
                  onSuccess: (renamed) => {
                    onDone();
                    navigate(`/p/${renamed.slug}`, { replace: true });
                  },
                })
              }
            >
              Save
            </Button>
          </>
        }
      >
        <TextField
          label="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoFocus
        />
      </Dialog>
      <Dialog
        open={action === 'delete'}
        onClose={onDone}
        title={`Delete “${project.name}”?`}
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(undefined, {
                  onSuccess: () => {
                    toast.success(`“${project.name}” was deleted.`);
                    navigate('/projects', { replace: true });
                  },
                })
              }
            >
              Delete project
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 14, color: 'var(--color-fg-muted)' }}>
          Its architecture and conversation are deleted too. This can’t be undone.
        </p>
      </Dialog>
    </>
  );
}

// ─── the Project drawer (A and B) ───────────────────────────────────────────

/**
 * The Project sidebar as an overlay drawer from the left, on a native modal `<dialog>`: it traps
 * focus, and Escape, the backdrop, the ✕ and picking a Project close it. B adds a footer with the
 * brand and the theme, which have left its header.
 */
function ProjectDrawer({
  current,
  open,
  onClose,
  footer,
}: {
  current: string;
  open: boolean;
  onClose: () => void;
  footer: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [creating, setCreating] = useState(false);
  const theme = useThemeChoice();
  // Swipe left on the drawer to close it.
  const swipe = useRef<number | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the keyboard way out is Escape, via onCancel.
    <dialog
      ref={ref}
      className="proto-drawer"
      aria-label="Projects"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onPointerDown={(e: PointerEvent) => {
        swipe.current = e.clientX;
      }}
      onPointerUp={(e: PointerEvent) => {
        if (swipe.current !== null && swipe.current - e.clientX > 60) onClose();
        swipe.current = null;
      }}
      style={{
        position: 'fixed',
        inset: '0 auto 0 0',
        margin: 0,
        width: 'min(20rem, 85vw)',
        height: '100dvh',
        maxHeight: 'none',
        padding: 0,
        border: 'none',
        borderRight: '1px solid var(--color-line)',
        background: 'var(--color-canvas, #fff)',
        color: 'var(--color-fg)',
        boxShadow: '8px 0 32px rgba(0,0,0,.2)',
        animation: 'proto-slide-in 220ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingInline: '16px 6px',
              height: BAR_H,
              flexShrink: 0,
              borderBottom: '1px solid var(--color-line)',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 17 }}>Projects</span>
            <IconButton label="Close" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </IconButton>
          </div>
          <nav aria-label="Projects" style={{ flexGrow: 1, minHeight: 0, overflowY: 'auto' }}>
            <ProjectList current={current} onPick={onClose} />
          </nav>
          <div style={{ padding: 12, borderTop: '1px solid var(--color-line)' }}>
            <Button variant="outline" onClick={() => setCreating(true)}>
              New project
            </Button>
          </div>
          {footer && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px 8px 16px',
                paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
                borderTop: '1px solid var(--color-line)',
              }}
            >
              <Link
                to="/"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontWeight: 800,
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <Logo size={22} /> sys-helper
              </Link>
              <ThemeMenu choice={theme} onChange={setThemeChoice} />
            </div>
          )}
          {creating && (
            <Dialog open onClose={() => setCreating(false)} title="New project">
              <NewProjectForm onCancel={() => setCreating(false)} />
            </Dialog>
          )}
        </div>
      )}
    </dialog>
  );
}

function ProjectList({ current, onPick }: { current: string; onPick: () => void }) {
  const projects = useProjects();
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: '6px 0' }}>
      {projects.data?.map((p) => {
        const here = slugSuffix(p.slug) === slugSuffix(current);
        return (
          <li key={p.slug}>
            <Link
              to={`/p/${p.slug}`}
              aria-current={here ? 'page' : undefined}
              onClick={onPick}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 48,
                paddingInline: 16,
                fontSize: 16,
                fontWeight: here ? 650 : 400,
                textDecoration: 'none',
                color: 'var(--color-fg)',
                background: here ? 'var(--color-accent-soft)' : undefined,
              }}
            >
              <span
                style={{
                  flexGrow: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.name}
              </span>
              {here && <Check size={18} aria-hidden="true" />}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Row({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        minHeight: 48,
        paddingInline: 16,
        fontSize: 16,
        cursor: 'pointer',
      }}
    >
      {icon}
      {children}
    </button>
  );
}
const SectionLabel = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      padding: '12px 16px 4px',
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      color: 'var(--color-fg-muted)',
    }}
  >
    {children}
  </div>
);
const Divider = () => (
  <hr style={{ margin: 0, border: 0, borderTop: '1px solid var(--color-line)' }} />
);

function StateReadout({
  variant,
  kb,
  pending,
  drawer,
}: {
  variant: string;
  kb: string;
  pending: boolean;
  drawer: boolean;
}) {
  if (!import.meta.env.DEV) return null;
  return (
    <output
      id="proto-state"
      style={{
        position: 'fixed',
        bottom: 4,
        right: 4,
        zIndex: 9999,
        font: '10px ui-monospace, monospace',
        background: 'rgba(0,0,0,.7)',
        color: '#fff',
        padding: '2px 6px',
        borderRadius: 4,
        pointerEvents: 'none',
      }}
    >
      variant={variant} drawer={drawer ? 'open' : 'closed'} kb={kb} proposal=
      {pending ? 'pending' : 'none'}
    </output>
  );
}

function useKeyboardViewport(top: number) {
  const mode = new URLSearchParams(window.location.search).get('kb') ?? 'scroll';
  const [vv, setVv] = useState({ height: window.innerHeight, offsetTop: 0 });
  useEffect(() => {
    const v = window.visualViewport;
    if (!v || mode === 'none') return;
    const on = () => {
      setVv({ height: v.height, offsetTop: v.offsetTop });
      if (mode === 'scroll') window.scrollTo(0, 0);
    };
    on();
    v.addEventListener('resize', on);
    v.addEventListener('scroll', on);
    return () => {
      v.removeEventListener('resize', on);
      v.removeEventListener('scroll', on);
    };
  }, [mode]);
  if (mode === 'none') return { mode, style: {} };
  return {
    mode,
    style: {
      height: `${vv.height - top}px`,
      transform: mode === 'translate' ? `translateY(${vv.offsetTop}px)` : undefined,
    },
  };
}

// ─── shared bits ────────────────────────────────────────────────────────────

const line = 'var(--color-line, #e4e2e8)';
const TABS: [Tab, string][] = [
  ['conversation', 'Chat'],
  ['requirements', 'Requirements'],
  ['decisions', 'Decisions'],
];

function TabRow({
  tab,
  onTab,
  counts,
  pending,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  counts: SheetSlots['counts'];
  pending: boolean;
}) {
  return (
    <div role="tablist" aria-label="Project" style={{ display: 'flex', flexGrow: 1 }}>
      {TABS.map(([id, label]) => {
        const count =
          id === 'requirements'
            ? counts.requirements
            : id === 'decisions'
              ? counts.decisions
              : undefined;
        const dot =
          (id === 'conversation' && pending) || (id === 'decisions' && counts.flagged > 0);
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            style={{
              all: 'unset',
              flexGrow: 1,
              textAlign: 'center',
              padding: '12px 4px',
              fontSize: 15,
              fontWeight: tab === id ? 700 : 500,
              borderBottom: `2px solid ${tab === id ? '#7c3aed' : 'transparent'}`,
              cursor: 'pointer',
            }}
          >
            {label}
            {count ? <span style={{ opacity: 0.6, fontSize: 12 }}> {count}</span> : null}
            {dot && <span style={{ color: '#b56f00' }}> ●</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── A: docked sheet ────────────────────────────────────────────────────────

type Snap = 'peek' | 'half' | 'full';
const PEEK = 76; // handle + tab row

function DockedSheet({ canvas, panel, pending, counts }: SheetSlots) {
  const box = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<Snap>('half');
  const [tab, setTab] = useState<Tab>('conversation');
  const [drag, setDrag] = useState<{ y: number; h: number; moved: boolean } | null>(null);
  const [dragH, setDragH] = useState<number | null>(null);
  const total = box.current?.clientHeight ?? 600;
  const heights: Record<Snap, number> = {
    peek: PEEK,
    half: Math.round(total * 0.5),
    full: total - 56,
  };
  const height = dragH ?? heights[snap];

  // A Proposal arriving while the sheet covers the canvas drops it to half, so the preview shows.
  const wasPending = useRef(pending);
  useEffect(() => {
    if (pending && !wasPending.current && snap === 'full') setSnap('half');
    wasPending.current = pending;
  }, [pending, snap]);

  function down(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ y: e.clientY, h: height, moved: false });
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const h = Math.min(heights.full, Math.max(PEEK, drag.h + drag.y - e.clientY));
    if (Math.abs(drag.y - e.clientY) > 4) drag.moved = true;
    setDragH(h);
  }
  function up() {
    if (!drag) return;
    if (!drag.moved) setSnap(snap === 'peek' ? 'half' : 'peek');
    else if (dragH !== null) {
      const nearest = (Object.keys(heights) as Snap[]).reduce((a, b) =>
        Math.abs(heights[a] - dragH) < Math.abs(heights[b] - dragH) ? a : b,
      );
      setSnap(nearest);
    }
    setDrag(null);
    setDragH(null);
  }

  return (
    <div ref={box} style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minHeight: 0 }}>
      <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {canvas}
      </div>
      <section
        aria-label="Project panel"
        style={{
          height,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderTop: `1px solid ${line}`,
          borderRadius: '12px 12px 0 0',
          background: 'var(--color-canvas, #fff)',
          boxShadow: '0 -4px 16px rgba(0,0,0,.08)',
          transition: drag ? 'none' : 'height 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          style={{
            touchAction: 'none',
            cursor: 'grab',
            padding: '8px 0 4px',
            display: 'grid',
            placeItems: 'center',
          }}
          title="Drag, or tap to hide/show"
        >
          <div style={{ width: 40, height: 5, borderRadius: 3, background: '#a9a5b0' }} />
        </div>
        <div style={{ display: 'flex', borderBottom: `1px solid ${line}` }}>
          <TabRow
            tab={tab}
            onTab={(t) => {
              setTab(t);
              if (snap === 'peek') setSnap('half');
            }}
            counts={counts}
            pending={pending}
          />
        </div>
        <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {panel(tab, setTab)}
        </div>
      </section>
    </div>
  );
}
