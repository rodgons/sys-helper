// Applies the stored theme choice before the first paint, so a forced theme never flashes the
// OS one. Mirrors lib/theme.ts (key `theme`, values `light` | `dark`), which takes over once React starts.
try {
  const theme = localStorage.getItem('theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch (_) {}
