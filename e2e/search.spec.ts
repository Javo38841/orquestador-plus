import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.getByRole('link', { name: 'Tareas' }).click();
});

test.afterEach(async () => {
  await launched.close();
});

test('CP-10-11: Ctrl K, typing part of a title and Enter lands on that task', async () => {
  const { page } = launched;
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Preparar presentación trimestral');
  await page.getByTestId('task-save').click();
  await expect(page.getByTestId('task-row')).toHaveCount(1);

  await page.getByRole('link', { name: 'Bugs e incidencias' }).click();
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Control+k');
  await page.getByTestId('search-input').fill('presentacion');
  await expect(page.getByTestId('search-result')).toHaveCount(1);
  await page.keyboard.press('Enter');

  await expect(page.getByTestId('search-input')).toHaveCount(0);
  const row = page.getByTestId('task-row').filter({ hasText: 'Preparar presentación trimestral' });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-highlighted', 'true');
});
