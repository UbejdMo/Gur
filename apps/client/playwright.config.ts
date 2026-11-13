import { defineConfig, devices } from '@playwright/test';

const PORT = 8090;

/**
 * Browser tests against the exported web build (run `pnpm build` first; Turbo does this in CI).
 */
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'phone-sideways', use: { ...devices['Pixel 7 landscape'] } },
  ],
  webServer: {
    command: `pnpm exec expo serve --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { EXPO_OFFLINE: '1' },
  },
});
