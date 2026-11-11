import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:8789', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: { command: 'node --import tsx apps/api/src/main.ts', url: 'http://127.0.0.1:8789/api/health', reuseExistingServer: false,
    env: { PORT: '8789', NODE_ENV: 'test', DATABASE_URL: '' } },
});
