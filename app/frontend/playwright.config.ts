import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

// Full-stack E2E: boots the Go API and the Vite dev server against the local Supabase stack.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'go run ./cmd/server',
      cwd: '../backend',
      url: 'http://localhost:8080/health',
      reuseExistingServer: !isCI,
    },
    {
      // Run the binary directly: a `pnpm dev` wrapper leaves Vite orphaned on teardown.
      command: './node_modules/.bin/vite',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
    },
  ],
});
