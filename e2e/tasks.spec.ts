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

test('CP-02-04: completing a task keeps it struck in pending and un-completing brings it back', async () => {
  const { page } = launched;
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Pagar la luz');
  await page.getByTestId('task-save').click();
  const row = page.getByTestId('task-row').filter({ hasText: 'Pagar la luz' });
  await expect(row).toBeVisible();

  await row.getByTestId('task-check').check();
  await expect(row).toHaveAttribute('data-done', 'true');

  await row.getByTestId('task-check').uncheck();
  await expect(row).not.toHaveAttribute('data-done', 'true');
  await expect(row).toBeVisible();
});

test('CP-05-39: a completed task removed from the list with the keyboard stays off Tareas and Hoy after a restart', async () => {
  const { page, app, dataDir } = launched;
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Limpiar logs');
  await page.getByTestId('task-save').click();
  const row = page.getByTestId('task-row').filter({ hasText: 'Limpiar logs' });
  await row.getByTestId('task-today').click();
  await row.getByTestId('task-check').check();
  await expect(row).toHaveAttribute('data-done', 'true');

  await row.getByTestId('task-hide').focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveCount(0);

  await app.close();
  launched = await launchApp(dataDir);
  const reopened = launched.page;
  await expect(reopened.getByTestId('task-row').filter({ hasText: 'Limpiar logs' })).toHaveCount(0);
  await reopened.getByRole('link', { name: 'Hoy' }).click();
  await expect(reopened.getByTestId('today-subtitle')).toBeVisible();
  await expect(reopened.getByTestId('today-task').filter({ hasText: 'Limpiar logs' })).toHaveCount(
    0,
  );

  await reopened.getByRole('link', { name: 'Tareas' }).click();
  await reopened.getByTestId('show-completed').check();
  await expect(reopened.getByTestId('task-row').filter({ hasText: 'Limpiar logs' })).toBeVisible();
});

test('CP-03-07: completing a task from Hoy lowers the count (it stays struck through, #93)', async () => {
  const { page } = launched;
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Preparar demo');
  await page.getByTestId('task-save').click();
  const row = page.getByTestId('task-row').filter({ hasText: 'Preparar demo' });
  await row.getByTestId('task-today').click();

  await page.getByRole('link', { name: 'Hoy' }).click();
  const item = page.getByTestId('today-task').filter({ hasText: 'Preparar demo' });
  await expect(item).toBeVisible();
  await expect(page.getByTestId('today-subtitle')).toContainText('1 pendiente');

  await item.getByTestId('today-check').check();
  await expect(item).toHaveAttribute('data-done', 'true');
  await expect(page.getByTestId('today-subtitle')).toContainText('0 pendientes');
});

test('CP-03-32: a task completed in Hoy stays struck, and once taken off the list it stays off after a restart', async () => {
  const { page, app, dataDir } = launched;
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Revisar PR');
  await page.getByTestId('task-save').click();
  await page
    .getByTestId('task-row')
    .filter({ hasText: 'Revisar PR' })
    .getByTestId('task-today')
    .click();

  await page.getByRole('link', { name: 'Hoy' }).click();
  const item = page.getByTestId('today-task').filter({ hasText: 'Revisar PR' });
  await item.getByTestId('today-check').check();
  await expect(item).toHaveAttribute('data-done', 'true');
  await expect(item.getByTestId('today-title')).toHaveCSS('text-decoration-line', 'line-through');

  await item.getByTestId('today-hide').click();
  await expect(item).toHaveCount(0);

  await app.close();
  launched = await launchApp(dataDir);
  const reopened = launched.page;
  await reopened.getByRole('link', { name: 'Hoy' }).click();
  await expect(reopened.getByTestId('today-subtitle')).toBeVisible();
  await expect(reopened.getByTestId('today-task').filter({ hasText: 'Revisar PR' })).toHaveCount(0);

  await reopened.getByRole('link', { name: 'Tareas' }).click();
  await reopened.getByTestId('show-completed').check();
  await expect(reopened.getByTestId('task-row').filter({ hasText: 'Revisar PR' })).toBeVisible();
});

test('CP-07-01: a tag added to a task shows as #infra in Tareas and in Hoy', async () => {
  const { page } = launched;
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Migrar DNS');
  await page.getByTestId('tag-input').fill('Infra');
  await page.getByTestId('tag-add').click();
  await page.getByTestId('task-save').click();

  const row = page.getByTestId('task-row').filter({ hasText: 'Migrar DNS' });
  await expect(row.getByTestId('task-tag')).toHaveText('#infra');

  await row.getByTestId('task-today').click();
  await page.getByRole('link', { name: 'Hoy' }).click();
  const item = page.getByTestId('today-task').filter({ hasText: 'Migrar DNS' });
  await expect(item.getByTestId('today-tag')).toHaveText('#infra');
});

test('CP-07-04: filtering Tareas by #infra hides tasks without it until the filter is removed', async () => {
  const { page } = launched;
  for (const [title, tag] of [
    ['Con etiqueta', 'infra'],
    ['Sin etiqueta', ''],
  ]) {
    await page.getByTestId('new-task').click();
    await page.getByTestId('task-title').fill(title);
    if (tag) {
      await page.getByTestId('tag-input').fill(tag);
      await page.getByTestId('tag-add').click();
    }
    await page.getByTestId('task-save').click();
    await expect(page.getByTestId('task-row').filter({ hasText: title })).toBeVisible();
  }

  await page.getByTestId('filter-tag').selectOption('infra');
  await expect(page.getByTestId('task-row')).toHaveCount(1);
  await expect(page.getByTestId('task-row').filter({ hasText: 'Con etiqueta' })).toBeVisible();

  await page.getByTestId('filter-tag').selectOption('');
  await expect(page.getByTestId('task-row')).toHaveCount(2);
});

test('CP-06-01: a weekly Friday task shows its repetition chip and appears in Series recurrentes', async () => {
  const { page } = launched;
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Revisar backups');
  await page.getByTestId('task-due').fill('2999-01-04');
  await page.getByTestId('recurrence-kind').selectOption('weekly');
  await page.getByTestId('recurrence-weekday').selectOption('5');
  await page.getByTestId('task-save').click();

  const row = page.getByTestId('task-row').filter({ hasText: 'Revisar backups' });
  await expect(row.getByTestId('repeat-chip')).toContainText('Semanal · viernes');

  await page.getByTestId('tab-series').click();
  const series = page.getByTestId('series-row').filter({ hasText: 'Revisar backups' });
  await expect(series).toBeVisible();
  await expect(series.getByTestId('series-rule')).toHaveText('Semanal · viernes');
});

test("CP-05-21: a row's actions are reachable, open and usable with the keyboard only", async () => {
  const { page } = launched;
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Solo teclado');
  await page.getByTestId('task-save').click();
  const row = page.getByTestId('task-row').filter({ hasText: 'Solo teclado' });
  await expect(row).toBeVisible();

  await row.getByTestId('task-check').focus();
  await page.keyboard.press('Tab');
  await expect(row.getByTestId('task-today')).toBeFocused();
  await expect(row.getByTestId('task-actions')).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(row.getByTestId('task-today')).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Tab');
  await expect(row.getByTestId('task-edit')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('task-form')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();

  await row.getByTestId('task-delete').focus();
  await page.keyboard.press('Enter');
  await row.getByTestId('task-delete-confirm').focus();
  await page.keyboard.press('Enter');
  await expect(row).toHaveCount(0);
});
