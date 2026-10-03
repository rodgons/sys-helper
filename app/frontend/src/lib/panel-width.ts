import { useEffect, useState } from 'react';

/** `localStorage` key for the side panel's width in px. Kept per browser, never on the server. */
export const PANEL_WIDTH_KEY = 'side-panel-width';

// In rem, so the bounds follow the root font size like the rest of the layout.
const MIN_REM = 20;
const DEFAULT_REM = 24;
// The canvas never gets narrower than this beside the panel.
const CANVAS_MIN_REM = 32;
// The panes' grid never gets narrower than this (`minWidth` in workspace.tsx); below it the page scrolls.
const PANES_MIN_REM = 64;
const STEP_REM = 1;

function remPx() {
  const size = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

export type PanelBounds = { min: number; max: number };

/** The panel's bounds in px, given the left pane's width in rem and the window's width in px. */
function bounds(leftRem: number, viewport: number): PanelBounds {
  const rem = remPx();
  const min = Math.round(MIN_REM * rem);
  const panes = Math.max(viewport, PANES_MIN_REM * rem);
  const max = Math.round(panes - (leftRem + CANVAS_MIN_REM) * rem);
  return { min, max: Math.max(min, max) };
}

const clamp = (value: number, { min, max }: PanelBounds) => Math.min(max, Math.max(min, value));

/** The stored width; null when there is none, it is invalid or out of bounds, or storage is blocked. */
function readStored(limits: PanelBounds): number | null {
  try {
    const raw = localStorage.getItem(PANEL_WIDTH_KEY);
    if (raw === null || !/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    return value >= limits.min && value <= limits.max ? value : null;
  } catch {
    return null;
  }
}

function store(value: number) {
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, String(value));
  } catch {
    // Storage is blocked: the width still holds until the page reloads.
  }
}

function useViewportWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

/**
 * The side panel's width in px, clamped to its bounds. The chosen width is kept as chosen, and
 * only what is shown is clamped, so a window that grows back restores it. `set` keeps the choice
 * for this session; `commit` also stores it (drags call `set` while moving and `commit` at the end).
 */
export function usePanelWidth(leftRem: number) {
  const viewport = useViewportWidth();
  const limits = bounds(leftRem, viewport);
  const [chosen, setChosen] = useState(
    () => readStored(limits) ?? Math.round(DEFAULT_REM * remPx()),
  );
  const width = clamp(chosen, limits);

  const set = (value: number) => setChosen(clamp(Math.round(value), limits));
  const commit = (value: number) => {
    const next = clamp(Math.round(value), limits);
    setChosen(next);
    store(next);
  };

  return {
    width,
    ...limits,
    step: Math.round(STEP_REM * remPx()),
    set,
    commit,
    reset: () => commit(DEFAULT_REM * remPx()),
  };
}
