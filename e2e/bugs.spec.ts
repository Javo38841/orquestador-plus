import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.getByRole('link', { name: 'Bugs e incidencias' }).click();
});

test.afterEach(async () => {
  await launched.close();
});

test('CP-09-01: a new bug shows as BUG-1 "Nuevo" and survives restarting the app', async () => {
  const { page, app, dataDir } = launched;
  await page.getByTestId('new-bug').click();
  await page.getByTestId('bug-title').fill('Falla el login');
  await page.getByTestId('bug-symptom').fill('Devuelve 500 al entrar');
  await page.getByTestId('bug-save').click();

  const row = page.getByTestId('bug-row').filter({ hasText: 'Falla el login' });
  await expect(row.getByTestId('bug-code')).toHaveText('BUG-1');
  await expect(row.getByTestId('bug-status-chip')).toHaveText('Nuevo');

  await app.close();
  const reopened = await launchApp(dataDir);
  launched = reopened;
  await reopened.page.getByRole('link', { name: 'Bugs e incidencias' }).click();
  const again = reopened.page.getByTestId('bug-row').filter({ hasText: 'Falla el login' });
  await expect(again.getByTestId('bug-code')).toHaveText('BUG-1');
  await expect(again.getByTestId('bug-status-chip')).toHaveText('Nuevo');
});

test('CP-09-25: resolving a bug from its sheet moves it to "Resueltos" and persists', async () => {
  const { page, app, dataDir } = launched;
  await page.getByTestId('new-bug').click();
  await page.getByTestId('bug-title').fill('Falla el login');
  await page.getByTestId('bug-save').click();

  await page.getByTestId('bug-row').filter({ hasText: 'Falla el login' }).click();
  await page.getByTestId('status-resolved').click();
  await expect(page.getByTestId('status-resolved')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tab-resolved')).toContainText('Resueltos · 1');

  await app.close();
  const reopened = await launchApp(dataDir);
  launched = reopened;
  await reopened.page.getByRole('link', { name: 'Bugs e incidencias' }).click();
  await reopened.page.getByTestId('tab-resolved').click();
  await expect(reopened.page.getByTestId('tab-resolved')).toContainText('Resueltos · 1');
  const row = reopened.page.getByTestId('bug-row').filter({ hasText: 'Falla el login' });
  await expect(row.getByTestId('bug-status-chip')).toHaveText('Resuelto');
});
