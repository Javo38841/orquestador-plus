import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

function page(dir: string, file: string, title: string, extra = '', body = 'Contenido.'): void {
  const target = path.join(dir, 'wiki', file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `---\ntitle: "${title}"\n${extra}---\n\n${body}\n`);
}

test.beforeEach(async () => {
  // Notes are files (ADR-001): put two sections in the data folder; the app indexes them at start.
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-e2e-'));
  page(dataDir, 'Empezar/_section.md', 'Empezar', 'order: 1\n', '');
  page(dataDir, 'Empezar/Instalar.md', 'Instalar', 'order: 1\ndescription: "Deja todo listo"\n');
  page(dataDir, 'Guías/_section.md', 'Guías', 'order: 2\n', '');
  page(dataDir, 'Guías/Desplegar.md', 'Desplegar', '', 'Pasos para desplegar.');
  launched = await launchApp(dataDir);
  await launched.page.getByRole('link', { name: 'Tareas' }).click();
  await launched.page.getByRole('link', { name: 'Wiki' }).click();
});

test.afterEach(async () => {
  await launched.close();
});

test('CP-08-28: entering the Wiki switches to documentation mode', async () => {
  const { page } = launched;
  await expect(page.getByTestId('wiki-name')).toHaveText('Wiki');
  await expect(page.getByTestId('wiki-search')).toHaveText('Buscar en la wiki · Ctrl K');
  await expect(page.getByTestId('wiki-exit')).toHaveText('Salir de la wiki · Esc');
  await expect(page.getByTestId('open-search')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Tareas' })).toHaveCount(0);
});

test('CP-08-29: a page of the tree opens with breadcrumbs, title, description and content', async () => {
  const { page } = launched;
  await expect(page.getByTestId('wiki-section-toggle')).toHaveCount(2);

  await page.getByTestId('note-item').filter({ hasText: 'Instalar' }).click();

  await expect(page.getByTestId('breadcrumb-section')).toHaveText('Empezar');
  await expect(page.getByTestId('breadcrumb-page')).toHaveText('Instalar');
  await expect(page.getByTestId('note-view-title')).toHaveText('Instalar');
  await expect(page.getByTestId('note-description')).toHaveText('Deja todo listo');
  await expect(page.getByTestId('note-body')).toContainText('Contenido.');
});

test('CP-08-30: Esc and "Salir de la wiki" go back to the screen of origin', async () => {
  const { page } = launched;
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Tareas', level: 1 })).toBeVisible();
  await expect(page.getByTestId('wiki-name')).toHaveCount(0);

  await page.getByRole('link', { name: 'Wiki' }).click();
  await page.getByTestId('wiki-exit').click();
  await expect(page.getByRole('heading', { name: 'Tareas', level: 1 })).toBeVisible();
});

test('CP-08-31: leaving with unsaved changes asks before discarding', async () => {
  const { page } = launched;
  await page.getByTestId('note-item').filter({ hasText: 'Desplegar' }).click();
  await page.getByTestId('note-edit').click();
  await page.getByTestId('note-content').fill('cambiado');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('discard-confirm')).toBeVisible();
  await page.getByTestId('discard-no').click();

  await page.getByTestId('wiki-exit').click();
  await expect(page.getByTestId('discard-confirm')).toBeVisible();
  await expect(page.getByTestId('wiki-name')).toBeVisible();

  await page.getByTestId('discard-yes').click();
  await expect(page.getByRole('heading', { name: 'Tareas', level: 1 })).toBeVisible();
});
