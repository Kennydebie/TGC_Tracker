import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    extraHTTPHeaders: {
      'oai-authenticated-user-id': 'playwright-scout',
      'oai-authenticated-user-email': 'playwright@tcg-scout.test',
      'oai-authenticated-user-full-name': 'Playwright%20Scout',
      'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `"${process.execPath}" scripts/start-e2e.mjs`,
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
