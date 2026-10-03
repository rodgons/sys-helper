import stylex from '@stylexjs/unplugin';
import react from '@vitejs/plugin-react';
import { Features } from 'lightningcss';
import { defineConfig } from 'vitest/config';

// Under Vitest use the plain Rollup adapter: the Vite adapter's dev-server HMR
// interval is never cleared in middleware mode and keeps Vitest from exiting.
// Keep `light-dark()` as written: Lightning CSS would lower it to a polyfill keyed on `color-scheme`
// rules in the same stylesheet, and ours live in global.css (the theme override, lib/theme.ts).
const stylexOptions = { lightningcssOptions: { exclude: Features.LightDark } };
const stylexPlugin = process.env.VITEST ? stylex.rollup(stylexOptions) : stylex.vite(stylexOptions);

export default defineConfig({
  // Single .env at the repo root is shared by every app.
  envDir: '../..',
  plugins: [stylexPlugin, react()],
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    env: {
      VITE_API_URL: 'http://api.test',
      VITE_SUPABASE_URL: 'http://supabase.test',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-key',
    },
  },
});
