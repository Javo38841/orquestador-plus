import { defineConfig } from '@playwright/test';

// E2E tests launch the packaged app (release/*-unpacked), not a browser.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
});
