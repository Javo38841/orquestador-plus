import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

test("CP-03-22: completing today's task lowers the group count and quick capture reaches the inbox", async () => {
  const { page } = launched;
  const addTask = async (title: string, due: string) => {
    await page.getByRole('link', { name: 'Tareas' }).click();
    await page.getByTestId('new-task').click();
    await page.getByTestId('task-title').fill(title);
    await page.getByTestId('task-due').fill(due);
    await page.getByTestId('task-save').click();
    await expect(page.getByTestId('task-row').filter({ hasText: title })).toBeVisible();
  };
  const today = new Date();
  const iso = (offset: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  await addTask('Tarea atrasada', iso(-1));
  await addTask('Tarea de hoy', iso(0));

  await page.getByRole('link', { name: 'Hoy' }).click();
  await expect(page.getByTestId('today-overdue-title')).toHaveText('ATRASADAS · 1');
  await expect(page.getByTestId('today-list-title')).toHaveText('PARA HOY · 1');

  await page
    .getByTestId('today-task')
    .filter({ hasText: 'Tarea de hoy' })
    .getByTestId('today-check')
    .check();
  await expect(page.getByTestId('today-list')).toHaveCount(0);
  await expect(page.getByTestId('today-overdue-title')).toHaveText('ATRASADAS · 1');

  await page.getByTestId('today-capture').fill('Idea rápida');
  await page.getByTestId('today-capture').press('Enter');
  await expect(page.getByTestId('today-capture')).toHaveValue('');
  await page.getByRole('link', { name: 'Bandeja de entrada' }).click();
  await expect(page.getByTestId('inbox-item').filter({ hasText: 'Idea rápida' })).toBeVisible();
});
