import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

test('CP-17-09: choosing a task, starting, pausing and resetting shows each state', async () => {
  const { page } = launched;
  await page.getByRole('link', { name: 'Tareas' }).click();
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill('Escribir informe');
  await page.getByTestId('task-save').click();
  await page
    .getByTestId('task-row')
    .filter({ hasText: 'Escribir informe' })
    .getByTestId('task-today')
    .click();

  await page.getByRole('link', { name: 'Hoy' }).click();
  await expect(page.getByTestId('focus-clock')).toHaveText('25:00');
  await expect(page.getByTestId('focus-state')).toHaveText('Detenido');

  await page.getByTestId('focus-task').selectOption({ label: 'Escribir informe' });
  await page.getByTestId('focus-start').click();
  await expect(page.getByTestId('focus-state')).toHaveText('En curso');
  await expect(page.getByTestId('focus-clock')).not.toHaveText('25:00');

  await page.getByTestId('focus-pause').click();
  await expect(page.getByTestId('focus-state')).toHaveText('En pausa');
  const frozen = await page.getByTestId('focus-clock').textContent();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('focus-clock')).toHaveText(frozen!);

  await page.getByTestId('focus-reset').click();
  await expect(page.getByTestId('focus-state')).toHaveText('Detenido');
  await expect(page.getByTestId('focus-clock')).toHaveText('25:00');
});
