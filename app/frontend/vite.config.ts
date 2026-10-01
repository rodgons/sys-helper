import preact from '@preact/preset-vite';
import stylex from '@stylexjs/unplugin';
import { defineConfig } from 'vitest/config';

// Under Vitest use the plain Rollup adapter: the Vite adapter's dev-server HMR
// interval is never cleared in middleware mode and keeps Vitest from exiting.
const stylexPlugin = process.env.VITEST ? stylex.rollup() : stylex.vite();

export default defineConfig({
  // Single .env at the repo root is shared by every app.
  envDir: '../..',
  plugins: [stylexPlugin, preact()],
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
