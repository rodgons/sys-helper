import { useSyncExternalStore } from 'react';
import { COMPACT_QUERY } from '../design/breakpoints';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const isCompact = () => window.matchMedia(COMPACT_QUERY).matches;

/**
 * Whether the window is in the compact layout (below 64rem: phones and portrait tablets). Every
 * consumer reads the same media query, so they all re-render together when it flips. Use it for
 * behaviour and tier-only chrome; sizing and placement belong in StyleX media keys.
 */
export function useCompact() {
  return useSyncExternalStore(subscribe, isCompact, () => false);
}
