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
