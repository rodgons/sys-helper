import { defineConfig, devices } from '@playwright/test';
import { apiPort, apiUrl, webPort, webUrl } from './e2e/servers';

const isCI = !!process.env.CI;

// Full-stack E2E: boots the Go API and the Vite dev server against the local Supabase stack.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: webUrl,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Build, then exec the binary so Playwright's signal reaches the server (`go run` would leave
      // it orphaned). Dedicated ports (e2e/servers.ts) mean only an earlier E2E server is reused.
      command: 'go build -o tmp/e2e-server ./cmd/server && exec ./tmp/e2e-server',
      cwd: '../backend',
      // The fake model: E2E never calls a real model. Test users get random GitHub ids, so the
      // allowlist admits everyone.
      env: {
        PORT: String(apiPort),
        CORS_ALLOWED_ORIGINS: webUrl,
        AI_FAKE: '1',
        ALLOW_ALL_GITHUB_USERS: '1',
      },
      url: `${apiUrl}/health`,
      timeout: 120_000,
      reuseExistingServer: !isCI,
    },
    {
      // Run the binary directly: a `pnpm dev` wrapper leaves Vite orphaned on teardown.
      command: `./node_modules/.bin/vite --port ${webPort}`,
      env: { VITE_API_URL: apiUrl },
      url: webUrl,
      reuseExistingServer: !isCI,
    },
  ],
});
