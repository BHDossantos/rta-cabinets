import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// These are mobile browser checks, not native-device or store-release validation.
const root = fileURLToPath(new URL('../..', import.meta.url));
export default defineConfig({
  testDir: '.',
  testMatch: '*.mobile.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'android-chromium', use: { ...devices['Pixel 5'],
      ...(process.env.MOBILE_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.MOBILE_CHROMIUM_EXECUTABLE } } : {}) } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    { command: 'npm start -w @rta/api', cwd: root, url: 'http://127.0.0.1:8787/api/health', reuseExistingServer: false,
      env: { PORT: '8787', NODE_ENV: 'test', DATABASE_URL: '', ADMIN_EMAIL: '', ADMIN_PASSWORD: '', ALLOW_DEMO_ACCOUNTS: 'true' } },
    { command: 'npm run preview -w @rta/web -- --host 127.0.0.1 --port 4173 --strictPort', cwd: root,
      url: 'http://127.0.0.1:4173', reuseExistingServer: false },
  ],
});
