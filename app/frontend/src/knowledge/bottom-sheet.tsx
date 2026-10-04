import * as stylex from '@stylexjs/stylex';
import { type KeyboardEvent, type PointerEvent, useRef } from 'react';
import { color, radius, space } from '../design/tokens.stylex';
import { type PanelTab, PanelTabs } from './side-panel';

/**
 * How much of the compact workspace the bottom sheet covers: the handle and tab row (`peek`), half
 * of it, or all but a strip of canvas (`full`).
 */
export type Snap = 'peek' | 'half' | 'full';

const SNAPS: Snap[] = ['peek', 'half', 'full'];
const PEEK_PX = 76;
const FULL_GAP_PX = 56;
const SNAP_LABELS: Record<Snap, string> = { peek: 'Peek', half: 'Half', full: 'Full' };

/** Each snap's height in px, for a workspace `total` px tall (below the workspace bar). */
export function snapHeights(total: number): Record<Snap, number> {
  return { peek: PEEK_PX, half: Math.round(total * 0.5), full: total - FULL_GAP_PX };
}

/** The snap closest to `height`, where a drag of the handle comes to rest. */
export function nearestSnap(height: number, total: number): Snap {
  const heights = snapHeights(total);
  return SNAPS.reduce((a, b) =>
    Math.abs(heights[a] - height) <= Math.abs(heights[b] - height) ? a : b,
  );
}

/** The sheet's height as CSS, at rest on a snap; the same numbers as snapHeights. */
export const SNAP_CSS: Record<Snap, string> = {
  peek: `${PEEK_PX}px`,
  half: '50%',
  full: `calc(100% - ${FULL_GAP_PX}px)`,
};

/**
 * The top of the compact layout's bottom sheet: a drag handle and the side panel's tab row. The
 * handle is a window splitter: drag it and it snaps to the nearest of peek, half and full; tap it
 * (or press Enter) to toggle peek and half; the arrow keys step between snaps. Tapping a tab while
 * the sheet peeks opens it to half. `onDrag` follows a drag in px (null once it ends) and `total`
 * measures the space the sheet moves in.
 */
export function SheetHead({
  slug,
  snap,
  onSnap,
  onDrag,
  total,
  tab,
  onTab,
  pending,
}: {
  slug: string;
  snap: Snap;
  onSnap: (snap: Snap) => void;
  onDrag: (height: number | null) => void;
  total: () => number;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  pending: boolean;
}) {
  const drag = useRef<{ y: number; height: number; moved: boolean } | null>(null);
  // Set when a drag just ended, so the click that follows it doesn't also toggle.
  const dragged = useRef(false);
  const toggle = () => onSnap(snap === 'peek' ? 'half' : 'peek');

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Not capturable (e.g. a synthetic pointer): moves over the handle still drag.
    }
    drag.current = { y: e.clientY, height: snapHeights(total())[snap], moved: false };
  }
  function heightAt(y: number) {
    const d = drag.current;
    if (!d) return 0;
    // Moving up raises the sheet, which sits at the bottom.
    return Math.min(snapHeights(total()).full, Math.max(PEEK_PX, d.height + d.y - y));
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(d.y - e.clientY) > 4) d.moved = true;
    if (d.moved) onDrag(heightAt(e.clientY));
  }
  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const height = heightAt(e.clientY);
    drag.current = null;
    if (!d.moved) return; // a tap: the click toggles
    dragged.current = true;
    onDrag(null);
    onSnap(nearestSnap(height, total()));
  }
  function onPointerCancel() {
    if (!drag.current) return;
    drag.current = null;
    onDrag(null);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const at = SNAPS.indexOf(snap);
    const next = {
      Enter: snap === 'peek' ? 'half' : 'peek',
      ' ': snap === 'peek' ? 'half' : 'peek',
      ArrowUp: SNAPS[Math.min(at + 1, SNAPS.length - 1)],
      ArrowDown: SNAPS[Math.max(at - 1, 0)],
      Home: 'peek',
      End: 'full',
    }[e.key] as Snap | undefined;
    if (!next) return;
    e.preventDefault();
    onSnap(next);
  }

  return (
    <div {...stylex.props(styles.head)}>
      {/* biome-ignore lint/a11y/useSemanticElements: an <hr> can't be focused or dragged; this is the ARIA window splitter pattern. */}
      <div
        role="separator"
        aria-label="Resize panel"
        aria-orientation="horizontal"
        aria-controls="project-panel"
        aria-valuemin={0}
        aria-valuemax={SNAPS.length - 1}
        aria-valuenow={SNAPS.indexOf(snap)}
        aria-valuetext={SNAP_LABELS[snap]}
        tabIndex={0}
        title="Drag, or tap to hide or show"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onClick={() => {
          if (dragged.current) dragged.current = false;
          else toggle();
        }}
        onKeyDown={onKeyDown}
        {...stylex.props(styles.handle)}
      >
        <span {...stylex.props(styles.grip)} />
      </div>
      <PanelTabs
        slug={slug}
        tab={tab}
        pending={pending}
        onSelect={(next) => {
          onTab(next);
          if (snap === 'peek') onSnap('half');
        }}
      />
    </div>
  );
}

const styles = stylex.create({
  head: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    borderBottomWidth: 1,
    borderBottomStyle: 'solid',
    borderBottomColor: color['--color-line'],
  },
  handle: {
    display: 'grid',
    placeItems: 'center',
    height: 24,
    cursor: 'grab',
    touchAction: 'none',
    outline: 'none',
    borderRadius: `${radius['--radius-xl']} ${radius['--radius-xl']} 0 0`,
    backgroundColor: { default: 'transparent', ':focus-visible': color['--color-accent-soft'] },
  },
  grip: {
    width: 40,
    height: 5,
    borderRadius: radius['--radius-full'],
    backgroundColor: color['--color-fg-faint'],
    marginTop: space['--space-1'],
  },
});
