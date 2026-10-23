import { defineConfig } from '@playwright/test';
const production = Boolean(process.env.WALOS_TEST_BUILD);
const url = production ? 'http://127.0.0.1:4173' : 'http://127.0.0.1:5173';
export default defineConfig({
  testMatch: production ? ['shell.spec.ts', 'wasip2.spec.ts'] : '**/*.spec.ts',
  testDir: 'tests',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: url,
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: production ? 'npm run preview' : 'npm run dev',
    url,
    reuseExistingServer: false,
  },
  reporter: 'list',
});
