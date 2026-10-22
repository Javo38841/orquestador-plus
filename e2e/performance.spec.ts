import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';
import { seedLargeVolume } from './seed';

/** RNF-05 thresholds: generous for CI, tight enough to catch a real regression. */
const WINDOW_MS = 5000;
const PALETTE_MS = 500;

let launched: LaunchedApp;
let dataDir: string;

// close() removes the data folder, so every test seeds its own.
test.beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-e2e-big-'));
  seedLargeVolume(dataDir);
});

test.afterEach(async () => {
  await launched.close();
});

test('CP-N05-06: with years of data the main window shows Hoy in under 5 s', async () => {
  const start = Date.now();
  launched = await launchApp(dataDir);
  await expect(launched.page.getByRole('heading', { level: 1, name: 'Hoy' })).toBeVisible({
    timeout: WINDOW_MS,
  });
  expect(Date.now() - start).toBeLessThan(WINDOW_MS);
});

test('CP-N05-07: Ctrl K and a common term show results in under 500 ms from the last key', async () => {
  launched = await launchApp(dataDir);
  const { page } = launched;
  await expect(page.getByRole('heading', { level: 1, name: 'Hoy' })).toBeVisible();
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Control+k');
  const input = page.getByTestId('search-input');
  await input.focus();

  await input.pressSequentially('informe');
  const lastKey = Date.now();
  await expect(page.getByTestId('search-result').first()).toBeVisible({ timeout: PALETTE_MS });
  expect(Date.now() - lastKey).toBeLessThan(PALETTE_MS);
});
