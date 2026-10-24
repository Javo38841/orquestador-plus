import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.getByRole('link', { name: 'Wiki' }).click();
});

test.afterEach(async () => {
  await launched.close();
});

async function createNote(page: LaunchedApp['page'], title: string, content = '') {
  await page.getByTestId('new-note').click();
  await page.getByTestId('note-title').fill(title);
  await page.getByTestId('note-content').fill(content);
  await page.getByTestId('note-save').click();
  await expect(page.getByTestId('note-view-title')).toHaveText(title);
}

test('CP-08-10: a [[link]] between notes is navigable and shows as a backlink', async () => {
  const { page } = launched;
  await createNote(page, 'A');
  await page.getByTestId('note-edit').click();
  await page.getByTestId('note-content').fill('Ver [[B]]');
  await page.getByTestId('note-save').click();
  await expect(page.getByTestId('note-link-pending')).toHaveText('B');

  await createNote(page, 'B');
  await page
    .getByTestId('note-item')
    .filter({ hasText: /^\s*A\s*$/ })
    .click();
  await page.getByTestId('note-link').click();

  await expect(page.getByTestId('note-view-title')).toHaveText('B');
  await expect(page.getByTestId('backlink')).toHaveText('A');
});

test('CP-08-11: Esc or picking another note asks before discarding unsaved changes', async () => {
  const { page } = launched;
  await createNote(page, 'A', 'uno');
  await createNote(page, 'B', 'dos');

  await page.getByTestId('note-edit').click();
  await page.getByTestId('note-content').fill('cambiado');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('discard-confirm')).toBeVisible();
  await page.getByTestId('discard-no').click();
  await expect(page.getByTestId('note-editor')).toBeVisible();

  await page
    .getByTestId('note-item')
    .filter({ hasText: /^\s*A\s*$/ })
    .click();
  await expect(page.getByTestId('discard-confirm')).toBeVisible();
  await page.getByTestId('discard-yes').click();
  await expect(page.getByTestId('note-view-title')).toHaveText('A');
});

test('CP-08-59: the top bar has logo and name left, centred search with Ctrl K and exit right', async () => {
  const { page } = launched;
  const bar = page.getByTestId('wiki-topbar');
  await expect(bar.getByTestId('wiki-logo')).toBeVisible();
  await expect(bar.getByTestId('wiki-name')).toHaveText('Wiki de OrquestadorPlus');
  await expect(bar.getByTestId('wiki-search-label')).toHaveText('Buscar en la wiki');
  await expect(bar.getByTestId('wiki-search-shortcut')).toHaveText('Ctrl K');
  await expect(bar.getByTestId('wiki-exit-label')).toHaveText('Salir de la wiki');
  await expect(bar.getByTestId('wiki-exit-shortcut')).toHaveText('Esc');

  const [barBox, brand, search, exit] = await Promise.all(
    [
      bar,
      bar.getByTestId('wiki-brand'),
      bar.getByTestId('wiki-search'),
      bar.getByTestId('wiki-exit'),
    ].map(async (l) => (await l.boundingBox())!),
  );
  expect(brand.x).toBeLessThan(search.x);
  expect(exit.x).toBeGreaterThan(search.x + search.width);
  const searchCentre = search.x + search.width / 2;
  const barCentre = barBox.x + barBox.width / 2;
  expect(Math.abs(searchCentre - barCentre)).toBeLessThan(barBox.width * 0.05);
});

test('CP-08-72: a section and a page created from the sidebar survive a restart', async () => {
  const { page, app, dataDir } = launched;
  await page.getByTestId('new-section').click();
  await page.getByTestId('new-section-name').fill('Guías');
  await page.getByTestId('new-section-save').click();
  const section = page.getByTestId('wiki-section').filter({ hasText: 'Guías' });
  await expect(section.getByTestId('wiki-section-toggle')).toContainText('Guías');

  await section.getByTestId('wiki-add-page').click();
  await section.getByTestId('new-page-title').fill('Instalación');
  await section.getByTestId('new-page-title').press('Enter');
  await expect(page.getByTestId('note-view-title')).toHaveText('Instalación');
  const selected = section.locator('[data-testid="note-item"][aria-current="page"]');
  await expect(selected).toHaveText('Instalación');
  await expect(selected).toHaveClass(/bg-accent/);

  await app.close();
  launched = await launchApp(dataDir);
  await launched.page.getByRole('link', { name: 'Wiki' }).click();
  const reopened = launched.page.getByTestId('wiki-section').filter({ hasText: 'Guías' });
  await expect(reopened.getByTestId('wiki-section-toggle')).toContainText('Guías');
  await expect(reopened.getByTestId('note-item')).toHaveText('Instalación');
});

test('CP-08-101: editing a note from the UI keeps the tags and source of its frontmatter', async () => {
  const { page, dataDir } = launched;
  await createNote(page, 'Con tags', 'uno');
  const file = path.join(dataDir, 'wiki', 'Con tags.md');
  const raw = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, raw.replace('created:', 'tags:\n  - a\n  - b\nsource: "x"\ncreated:'));
  // The app notices the outside edit and reloads the page; a marker note tells when that happened.
  fs.writeFileSync(path.join(dataDir, 'wiki', 'Marcador.md'), '---\ntitle: "Marcador"\n---\n\nx');
  await expect(page.getByTestId('note-item').filter({ hasText: 'Marcador' })).toBeVisible();
  await page.getByTestId('note-edit').click();
  await page.getByTestId('note-content').fill('dos');
  await page.getByTestId('note-save').click();
  await expect(page.getByTestId('note-view-title')).toHaveText('Con tags');

  const saved = fs.readFileSync(file, 'utf8');
  expect(saved).toContain('tags:\n  - a\n  - b\nsource: "x"\n');
  expect(saved.endsWith('\n\ndos')).toBe(true);
});

test('CP-08-113: a .md created outside the app shows in the sidebar without restarting', async () => {
  const { page, dataDir } = launched;
  await expect(page.getByTestId('wiki-empty')).toBeVisible();
  const wikiDir = path.join(dataDir, 'wiki');
  fs.mkdirSync(wikiDir, { recursive: true });

  fs.writeFileSync(
    path.join(wikiDir, 'Desde fuera.md'),
    '---\ntitle: "Desde fuera"\n---\n\nEscrita con otro editor',
  );

  await expect(page.getByTestId('note-item').filter({ hasText: 'Desde fuera' })).toBeVisible({
    timeout: 5000,
  });
});

// 1x1 transparent PNG
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('CP-08-131: an image attached while editing shows in the reading view and lives next to the note', async () => {
  const { page, dataDir } = launched;
  await createNote(page, 'Instalación', 'Pasos:\n');

  await page.getByTestId('note-edit').click();
  await page.getByTestId('note-attach-input').setInputFiles({
    name: 'captura.png',
    mimeType: 'image/png',
    buffer: PIXEL,
  });
  await expect(page.getByTestId('note-content')).toHaveValue(
    /!\[captura\]\(Instalación\.assets\/captura\.png\)/,
  );
  await page.getByTestId('note-save').click();

  const image = page.getByTestId('note-image');
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  const stored = path.join(dataDir, 'wiki', 'Instalación.assets', 'captura.png');
  expect(fs.readFileSync(stored)).toEqual(PIXEL);
});
