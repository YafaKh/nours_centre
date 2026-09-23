import { defineConfig, devices } from '@playwright/test';

// Phase 7 (PLAN.md): RTL/mobile behavior can only really be proven in a real browser, so these
// specs drive the actual app end to end against the one-command dev stack, reusing whatever
// `npm run dev` is already running locally and starting one fresh in CI.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  globalSetup: require.resolve('./e2e/global-setup'),
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run setup && npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
