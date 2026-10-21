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

test('CP-02-01: a task saved without project shows the "Suelta" chip', async () => {
  const { page } = launched;
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Llamar al dentista');
  await page.getByTestId('task-save').click();

  const row = page.getByTestId('task-row').filter({ hasText: 'Llamar al dentista' });
  await expect(row).toBeVisible();
  await expect(row.getByTestId('task-project-chip')).toHaveText('Suelta');
});

test('CP-02-02: a project created from the task form shows as the chip', async () => {
  const { page } = launched;
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Revisar rate limit');
  await page.getByTestId('task-project').selectOption('new');
  await page.getByTestId('task-new-project').fill('api-gateway');
  await page.getByTestId('task-save').click();

  const row = page.getByTestId('task-row').filter({ hasText: 'Revisar rate limit' });
  await expect(row.getByTestId('task-project-chip')).toHaveText('api-gateway');
});

test('CP-02-04: completing a task removes it from pending and un-completing brings it back', async () => {
  const { page } = launched;
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Pagar la luz');
  await page.getByTestId('task-save').click();
  const row = page.getByTestId('task-row').filter({ hasText: 'Pagar la luz' });
  await expect(row).toBeVisible();

  await row.getByTestId('task-check').check();
  await expect(row).toHaveCount(0);

  await page.getByTestId('show-completed').check();
  const done = page.getByTestId('task-row').filter({ hasText: 'Pagar la luz' });
  await expect(done).toBeVisible();
  await done.getByTestId('task-check').uncheck();

  await page.getByTestId('show-completed').uncheck();
  await expect(page.getByTestId('task-row').filter({ hasText: 'Pagar la luz' })).toBeVisible();
});
