import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Not a test suite: captures the home page's workspace screenshots (`make demo-screenshots`).
export default defineConfig({
  ...base,
  testDir: './demo',
  testMatch: '*.capture.ts',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], deviceScaleFactor: 2 } }],
});
