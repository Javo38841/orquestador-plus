import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

async function capture(launchedApp: LaunchedApp, text: string): Promise<void> {
  const { page } = launchedApp;
  // Wait for Angular to render and give the window focus before the shortcut.
  await expect(page.getByRole('link', { name: 'Bandeja de entrada' })).toBeVisible();
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Control+Space');
  await page.getByTestId('capture-input').fill(text);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('capture-input')).toHaveValue('');
  await page.keyboard.press('Escape');
}

test('CP-01-01: Ctrl+Space captures an item that shows first in the inbox', async () => {
  const { page } = launched;
  await page.getByRole('link', { name: 'Tareas' }).click();

  await capture(launched, 'Comprar cable USB-C');

  await expect(page.getByTestId('inbox-count')).toHaveText('1');
  await page.getByRole('link', { name: 'Bandeja de entrada' }).click();
  const first = page.getByTestId('inbox-item').first();
  await expect(first).toContainText('Comprar cable USB-C');
  await expect(first).toContainText('Captura rápida');
});

test('CP-01-02: a captured item is still in the inbox after restarting the app', async () => {
  await capture(launched, 'Sigue aquí');
  const { dataDir } = launched;
  await launched.app.close();

  const reopened = await launchApp(dataDir);
  try {
    await reopened.page.getByRole('link', { name: 'Bandeja de entrada' }).click();
    await expect(reopened.page.getByTestId('inbox-item').first()).toContainText('Sigue aquí');
  } finally {
    await reopened.app.close();
  }
});

test('CP-01-08: converting an inbox item creates a task with project and due date', async () => {
  const { page } = launched;
  await capture(launched, 'Calibrar sensor');
  await page.getByRole('link', { name: 'Bandeja de entrada' }).click();
  await page.getByTestId('inbox-item').filter({ hasText: 'Calibrar sensor' }).click();
  await page.getByTestId('classify-project').selectOption('new');
  await page.getByTestId('classify-new-project').fill('cabina');
  await page.getByTestId('classify-due').fill('2026-12-31');
  await page.getByTestId('classify-convert').click();
  await expect(page.getByTestId('inbox-item')).toHaveCount(0);

  await page.getByRole('link', { name: 'Tareas' }).click();
  const row = page.getByTestId('task-row').filter({ hasText: 'Calibrar sensor' });
  await expect(row.getByTestId('task-project-chip')).toHaveText('cabina');
  await expect(row.getByTestId('task-due-date')).toHaveText('2026-12-31');
});
