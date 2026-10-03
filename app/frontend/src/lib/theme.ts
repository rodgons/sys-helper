import { useSyncExternalStore } from 'react';

/** The User's theme: follow the OS (`system`) or force one scheme. Kept per device, never on the server. */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** `localStorage` key. `public/theme-init.js` reads it too, so the first paint is already right. */
export const THEME_KEY = 'theme';

const SCHEME_MEDIA = {
  light: '(prefers-color-scheme: light)',
  dark: '(prefers-color-scheme: dark)',
} as const;

const listeners = new Set<() => void>();

function parse(value: string | null | undefined): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** The stored choice; `system` when there is none, it is unknown or storage is blocked. */
export function readThemeChoice(): ThemeChoice {
  try {
    return parse(localStorage.getItem(THEME_KEY));
  } catch {
    return 'system';
  }
}

/**
 * Forces a scheme with `data-theme` on `<html>` (global.css turns it into `color-scheme`, which
 * the `light-dark()` tokens follow) and points the `theme-color` metas at it.
 */
function apply(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.dataset.scheme as keyof typeof SCHEME_MEDIA | undefined;
    if (!scheme) continue;
    meta.media = choice === 'system' ? SCHEME_MEDIA[scheme] : choice === scheme ? 'all' : 'not all';
  }
}

/** Syncs the page with the stored choice. `main.tsx` calls it once before rendering. */
export function initTheme() {
  apply(readThemeChoice());
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage is blocked: the choice still holds until the page reloads.
  }
  apply(choice);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// `<html data-theme>` is the source of truth: theme-init.js sets it before React starts.
const snapshot = () => parse(document.documentElement.dataset.theme);

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, snapshot);
}
