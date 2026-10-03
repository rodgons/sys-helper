import * as stylex from '@stylexjs/stylex';

// Design tokens. Keys start with `--` so StyleX keeps them as literal CSS custom properties:
// the names are stable, readable in devtools, and usable from global.css.

/**
 * Semantic colors. Components pick a role (canvas, fg, line, accent…), never a raw hex.
 * `accent` is a fill that carries white text; `accentStrong` is the accent as readable text.
 * Each is `light-dark(light, dark)`, so the scheme follows `color-scheme`: the OS by default,
 * or the User's choice through `<html data-theme>` (global.css, `lib/theme.ts`).
 */
export const color = stylex.defineVars({
  '--color-canvas': 'light-dark(#ffffff, #0d0a12)',
  '--color-subtle': 'light-dark(#f6f5f8, #17131e)',
  '--color-surface': 'light-dark(#ffffff, #0d0a12)',
  '--color-raised': 'light-dark(#ffffff, #1b1822)',
  '--color-line': 'light-dark(#e4e2e8, #2a2631)',
  '--color-line-strong': 'light-dark(#0d0b12, #4a4552)',
  '--color-fg': 'light-dark(#0d0b12, #ecebef)',
  '--color-fg-muted': 'light-dark(#534f5c, #a9a5b0)',
  '--color-fg-faint': 'light-dark(#6e6977, #858090)',
  '--color-accent': '#7c3aed',
  '--color-accent-strong': 'light-dark(#6425d0, #b79cff)',
  '--color-accent-soft': 'light-dark(#f2ecff, #24133f)',
  '--color-on-accent': '#ffffff',
  '--color-slab': 'light-dark(#0f0d14, #1c1922)',
  '--color-on-slab': 'light-dark(#ffffff, #f1f0f3)',
  '--color-success': 'light-dark(#0a8f50, #34d399)',
  '--color-warning': 'light-dark(#b56f00, #f5b43c)',
  '--color-danger': 'light-dark(#d1263a, #ff6b6b)',
  '--color-info': 'light-dark(#2563d9, #7aa7ff)',
});

/** 4px spacing scale plus fluid section rhythm. */
export const space = stylex.defineVars({
  '--space-1': '0.25rem',
  '--space-2': '0.5rem',
  '--space-3': '0.75rem',
  '--space-4': '1rem',
  '--space-5': '1.25rem',
  '--space-6': '1.5rem',
  '--space-8': '2rem',
  '--space-10': '2.5rem',
  '--space-12': '3rem',
  '--space-16': '4rem',
  '--space-section': 'clamp(4rem, 9vw, 7rem)',
});

export const font = stylex.defineVars({
  '--font-sans':
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  '--font-display': '"Bricolage Grotesque Variable", ui-sans-serif, system-ui, sans-serif',
  '--font-mono':
    '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
});

/** Text sizes. Display sizes are fluid so headlines scale with the viewport without breakpoints. */
export const text = stylex.defineVars({
  '--text-2xs': '0.6875rem',
  '--text-xs': '0.75rem',
  '--text-sm': '0.875rem',
  '--text-md': '1rem',
  '--text-lg': '1.125rem',
  '--text-xl': '1.3125rem',
  '--text-2xl': 'clamp(1.5rem, 2.5vw, 1.875rem)',
  '--text-display-sm': 'clamp(2rem, 4vw, 2.75rem)',
  '--text-display-md': 'clamp(2.5rem, 6vw, 4.5rem)',
  '--text-display-lg': 'clamp(2.75rem, 8vw, 6rem)',
});

/** Mostly square corners; only cards and pills round off. `--cut` is the chamfer on buttons. */
export const radius = stylex.defineVars({
  '--radius-sm': '2px',
  '--radius-md': '4px',
  '--radius-lg': '8px',
  '--radius-xl': '16px',
  '--radius-full': '9999px',
  '--cut': '10px',
});

export const layout = stylex.defineVars({
  '--container': '76rem',
  '--container-narrow': '46rem',
  '--gutter': 'clamp(1.25rem, 4vw, 2.5rem)',
  '--header-h': '64px',
  // The bars atop the workspace panes (canvas title, side panel tabs), so their rules line up.
  '--pane-head-h': '3.5rem',
});

export const motion = stylex.defineVars({
  '--ease-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
  '--duration': '150ms',
});

/** Mobile-first breakpoints, used as `{ default: …, [media.md]: … }` keys. */
export const media = stylex.defineConsts({
  sm: '@media (min-width: 40rem)',
  md: '@media (min-width: 48rem)',
  lg: '@media (min-width: 64rem)',
  reducedMotion: '@media (prefers-reduced-motion: reduce)',
});
