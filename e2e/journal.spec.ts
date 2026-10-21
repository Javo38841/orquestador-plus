import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.getByRole('link', { name: 'Bitácora' }).click();
});

test.afterEach(async () => {
  await launched.close();
});

test('CP-12-08: a saved journal entry is still there after restarting the app', async () => {
  const { page, app, dataDir } = launched;
  await page.getByTestId('journal-text').fill('Hoy cerré el login');
  await page.getByTestId('journal-save').click();
  await expect(page.getByTestId('journal-saved')).toBeVisible();

  await app.close();
  const reopened = await launchApp(dataDir);
  launched = reopened;
  await reopened.page.getByRole('link', { name: 'Bitácora' }).click();
  await expect(reopened.page.getByTestId('journal-text')).toHaveValue('Hoy cerré el login');
});
