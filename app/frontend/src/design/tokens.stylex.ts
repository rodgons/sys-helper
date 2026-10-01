import * as stylex from '@stylexjs/stylex';

// Design tokens. Keys start with `--` so StyleX keeps them as literal CSS custom properties:
// the names are stable, readable in devtools, and usable from global.css.

const DARK = '@media (prefers-color-scheme: dark)';

/**
 * Semantic colors. Components pick a role (canvas, fg, line, accent…), never a raw hex.
 * `accent` is a fill that carries white text; `accentStrong` is the accent as readable text.
 */
export const color = stylex.defineVars({
  '--color-canvas': { default: '#ffffff', [DARK]: '#0d0a12' },
  '--color-subtle': { default: '#f6f5f8', [DARK]: '#17131e' },
  '--color-surface': { default: '#ffffff', [DARK]: '#0d0a12' },
  '--color-raised': { default: '#ffffff', [DARK]: '#1b1822' },
  '--color-line': { default: '#e4e2e8', [DARK]: '#2a2631' },
  '--color-line-strong': { default: '#0d0b12', [DARK]: '#4a4552' },
  '--color-fg': { default: '#0d0b12', [DARK]: '#ecebef' },
  '--color-fg-muted': { default: '#534f5c', [DARK]: '#a9a5b0' },
  '--color-fg-faint': { default: '#6e6977', [DARK]: '#858090' },
  '--color-accent': { default: '#7c3aed', [DARK]: '#7c3aed' },
  '--color-accent-strong': { default: '#6425d0', [DARK]: '#b79cff' },
  '--color-accent-soft': { default: '#f2ecff', [DARK]: '#24133f' },
  '--color-on-accent': '#ffffff',
  '--color-slab': { default: '#0f0d14', [DARK]: '#1c1922' },
  '--color-on-slab': { default: '#ffffff', [DARK]: '#f1f0f3' },
  '--color-success': { default: '#0a8f50', [DARK]: '#34d399' },
  '--color-warning': { default: '#b56f00', [DARK]: '#f5b43c' },
  '--color-danger': { default: '#d1263a', [DARK]: '#ff6b6b' },
  '--color-info': { default: '#2563d9', [DARK]: '#7aa7ff' },
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
