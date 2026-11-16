import { defineConfig, devices } from '@playwright/test';

const PORT = 8090;
/** The game server the tests start for playing with friends. The app is pointed at it in e2e/friends.spec.ts. */
export const SERVER_PORT = 3190;
/** A stand-in for the Supabase project (accounts), see e2e/fake-supabase.mjs and e2e/account.spec.ts. */
export const ACCOUNTS_PORT = 3191;
export const ACCOUNTS_KEY = 'sb_publishable_for_tests';

/**
 * Browser tests against the exported web build and the built game server
 * (run `pnpm build` first; Turbo does this in CI).
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
  webServer: [
    {
      command: `pnpm exec expo serve --port ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { EXPO_OFFLINE: '1' },
    },
    {
      command: 'node ../server/dist/index.js',
      url: `http://localhost:${SERVER_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        PORT: String(SERVER_PORT),
        SUPABASE_URL: `http://localhost:${ACCOUNTS_PORT}`,
        SUPABASE_KEY: ACCOUNTS_KEY,
      },
    },
    {
      command: 'node e2e/fake-supabase.mjs',
      url: `http://localhost:${ACCOUNTS_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { PORT: String(ACCOUNTS_PORT) },
    },
  ],
});
