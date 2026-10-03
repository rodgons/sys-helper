// PROTOTYPE: throwaway, lives only on the `prototype/mobile-bottom-sheet` branch.
// Question: below 64rem, how should the side panel (Conversation / Requirements / Decisions) sit
// with the canvas? Three variants on the real `/p/:slug` route, switchable via `?variant=`:
//   A  docked sheet: under the canvas, drag the handle between peek / half / full; the canvas shrinks.
//   B  floating card: the canvas fills the screen; the panel floats over it and hides to a button.
//   C  full-screen tabs: a bottom tab bar switches between the canvas and each panel tab.
// `?kb=scroll|translate|none` picks the iOS keyboard fallback (see useKeyboardViewport).
import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import type { Review } from '../architecture/review';
import type { Tab } from '../knowledge/side-panel';
import { useVariant, VariantSwitcher } from '../prototype/variant-switcher';
import { Button } from '../ui/button';

export const VARIANTS: [string, string][] = [
  ['A', 'Docked sheet'],
  ['B', 'Floating card'],
  ['C', 'Full-screen tabs'],
];

export type Slots = {
  title: ReactNode;
  canvas: ReactNode;
  /** The side panel; `head: 'none'` hides its own tab row so the variant can draw one. */
  panel: (tab: Tab, onTab: (t: Tab) => void) => ReactNode;
  pending: boolean;
  review: Review | null;
  counts: { requirements?: number; decisions?: number; flagged: number };
};

export function useCompact() {
  const query = '(max-width: 63.99rem)';
  const [compact, setCompact] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setCompact(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return compact;
}

/**
 * iOS Safari ignores `interactive-widget`, so `dvh` doesn't shrink for the keyboard and Safari pans
 * the visual viewport instead. Size the workspace to `visualViewport.height` and undo the pan.
 */
function useKeyboardViewport() {
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
      height: `${vv.height - 64}px`,
      transform: mode === 'translate' ? `translateY(${vv.offsetTop}px)` : undefined,
    },
  };
}

export function CompactWorkspace(slots: Slots) {
  const variant = useVariant(VARIANTS.map(([k]) => k));
  const kb = useKeyboardViewport();
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        height: 'calc(100dvh - 64px)',
        ...kb.style,
      }}
    >
      {slots.title}
      {variant === 'A' && <DockedSheet {...slots} />}
      {variant === 'B' && <FloatingCard {...slots} />}
      {variant === 'C' && <FullScreenTabs {...slots} />}
      <VariantSwitcher variants={VARIANTS} />
      <StateReadout variant={variant} kb={kb.mode} pending={slots.pending} />
    </main>
  );
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
  counts: Slots['counts'];
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

function StateReadout({ variant, kb, pending }: { variant: string; kb: string; pending: boolean }) {
  if (!import.meta.env.DEV) return null;
  return (
    <output
      style={{
        position: 'fixed',
        top: 48,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        font: '10px ui-monospace, monospace',
        background: 'rgba(0,0,0,.7)',
        color: '#fff',
        padding: '2px 6px',
        borderRadius: 4,
        pointerEvents: 'none',
      }}
      id="proto-state"
    >
      variant={variant} kb={kb} proposal={pending ? 'pending' : 'none'}
    </output>
  );
}

// ─── A: docked sheet ────────────────────────────────────────────────────────

type Snap = 'peek' | 'half' | 'full';
const PEEK = 76; // handle + tab row

function DockedSheet({ title: _t, canvas, panel, pending, counts }: Slots) {
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

// ─── B: floating card ───────────────────────────────────────────────────────

function FloatingCard({ canvas, panel, pending, counts }: Slots) {
  const [open, setOpen] = useState(true);
  const [tall, setTall] = useState(false);
  const [tab, setTab] = useState<Tab>('conversation');
  return (
    <div
      style={{
        position: 'relative',
        flexGrow: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {canvas}
      <section
        aria-label="Project panel"
        style={{
          display: open ? 'flex' : 'none',
          position: 'absolute',
          left: 8,
          right: 8,
          bottom: 8,
          height: tall ? 'calc(100% - 16px)' : '58%',
          flexDirection: 'column',
          borderRadius: 14,
          border: `1px solid ${line}`,
          background: 'var(--color-canvas, #fff)',
          boxShadow: '0 10px 40px rgba(0,0,0,.25)',
          overflow: 'hidden',
          transition: 'height 200ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${line}` }}>
          <TabRow tab={tab} onTab={setTab} counts={counts} pending={pending} />
          <IconBtn label={tall ? 'Shrink' : 'Expand'} onClick={() => setTall((t) => !t)}>
            {tall ? '▾' : '▴'}
          </IconBtn>
          <IconBtn label="Hide panel" onClick={() => setOpen(false)}>
            ✕
          </IconBtn>
        </div>
        <div style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {panel(tab, setTab)}
        </div>
      </section>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            all: 'unset',
            position: 'absolute',
            right: 16,
            bottom: 16,
            padding: '14px 18px',
            borderRadius: 999,
            background: '#7c3aed',
            color: '#fff',
            fontWeight: 700,
            boxShadow: '0 8px 24px rgba(124,58,237,.45)',
            cursor: 'pointer',
          }}
        >
          💬 Chat{pending && <span style={{ marginLeft: 6, color: '#f5b43c' }}>● Proposal</span>}
        </button>
      )}
    </div>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        all: 'unset',
        width: 44,
        height: 44,
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        fontSize: 16,
      }}
    >
      {children}
    </button>
  );
}

// ─── C: full-screen tabs ────────────────────────────────────────────────────

type View = 'canvas' | Tab;

function FullScreenTabs({ canvas, panel, pending, review, counts }: Slots) {
  const [view, setView] = useState<View>('conversation');
  const tab: Tab = view === 'canvas' ? 'conversation' : view;
  const layer = (shown: boolean): React.CSSProperties => ({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    visibility: shown ? 'visible' : 'hidden',
  });
  const items: [View, string, string][] = [
    ['canvas', '◇', 'Canvas'],
    ['conversation', '💬', 'Chat'],
    ['requirements', '☰', 'Requirements'],
    ['decisions', '✓', 'Decisions'],
  ];
  return (
    <>
      <div style={{ position: 'relative', flexGrow: 1, minHeight: 0 }}>
        {/* Both layers stay mounted; React Flow needs a measured box, so hide with visibility. */}
        <div style={layer(view === 'canvas')}>
          {canvas}
          {pending && review && (
            <div
              style={{
                position: 'absolute',
                left: 8,
                right: 8,
                bottom: 8,
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                padding: 10,
                borderRadius: 10,
                background: 'var(--color-raised, #fff)',
                border: `1px solid ${line}`,
                boxShadow: '0 6px 20px rgba(0,0,0,.18)',
              }}
            >
              <span style={{ flexGrow: 1, fontSize: 14 }}>Previewing Proposal {review.seq}</span>
              <Button
                size="sm"
                disabled={review.busy || review.stale !== null}
                onClick={review.accept}
              >
                Accept
              </Button>
              <Button size="sm" variant="outline" disabled={review.busy} onClick={review.reject}>
                Reject
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setView('conversation')}>
                Chat
              </Button>
            </div>
          )}
        </div>
        <div style={layer(view !== 'canvas')}>{panel(tab, (t) => setView(t))}</div>
      </div>
      <nav
        aria-label="Workspace"
        style={{
          display: 'flex',
          borderTop: `1px solid ${line}`,
          background: 'var(--color-canvas, #fff)',
        }}
      >
        {items.map(([id, icon, label]) => {
          const count =
            id === 'requirements'
              ? counts.requirements
              : id === 'decisions'
                ? counts.decisions
                : undefined;
          const dot = (id === 'canvas' && pending) || (id === 'decisions' && counts.flagged > 0);
          return (
            <button
              key={id}
              type="button"
              aria-current={view === id ? 'page' : undefined}
              onClick={() => setView(id)}
              style={{
                all: 'unset',
                flexGrow: 1,
                display: 'grid',
                placeItems: 'center',
                padding: '8px 0 10px',
                fontSize: 11,
                fontWeight: view === id ? 700 : 500,
                color: view === id ? '#7c3aed' : 'inherit',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 20 }}>
                {icon}
                {dot && <span style={{ color: '#b56f00', fontSize: 10 }}>●</span>}
              </span>
              {label}
              {count ? ` ${count}` : ''}
            </button>
          );
        })}
      </nav>
    </>
  );
}
