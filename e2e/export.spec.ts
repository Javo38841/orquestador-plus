import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;
let outDir: string;

test.beforeEach(async () => {
  launched = await launchApp();
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-export-e2e-'));
  await launched.page.getByRole('link', { name: 'Ajustes' }).click();
});

test.afterEach(async () => {
  await launched.close();
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('CP-11-01: Ajustes / Exportar shows what is exported, the button and the offline indicator', async () => {
  const { page } = launched;
  await expect(page.getByRole('heading', { name: 'Exportar' })).toBeVisible();
  await expect(page.getByTestId('export-included')).toContainText('Tareas');
  await expect(page.getByTestId('export-included')).toContainText('Bandeja de entrada');
  await expect(page.getByRole('button', { name: 'Exportar todo' })).toBeVisible();
  await expect(page.getByTestId('export-offline')).toHaveText('Datos locales, sin conexión');
});

test('CP-11-09: "Exportar todo" writes the ZIP to the chosen path and confirms the location', async () => {
  const { page, app } = launched;
  const target = path.join(outDir, 'respaldo.zip');
  // The native dialog cannot be driven; main is told which path the user "picked".
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, target);

  await page.getByTestId('export-all').click();

  await expect(page.getByTestId('export-path')).toHaveText(target);
  const zip = fs.readFileSync(target);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  expect(zip.includes(Buffer.from('tasks.json'))).toBe(true);
  expect(fs.readdirSync(outDir)).toEqual(['respaldo.zip']);
});

test('CP-11-08: cancelling the dialog leaves no file and says so', async () => {
  const { page, app } = launched;
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' });
  });
  await page.getByTestId('export-all').click();
  await expect(page.getByTestId('export-failed')).toContainText('cancelada');
  expect(fs.readdirSync(outDir)).toEqual([]);
});
