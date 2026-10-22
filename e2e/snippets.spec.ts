import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.getByRole('link', { name: 'Snippets' }).click();
});

test.afterEach(async () => {
  await launched.close();
});

test('CP-13-10: a created snippet is copied to the clipboard and survives restarting the app', async () => {
  const { page, app, dataDir } = launched;
  const content = 'SELECT *\n  FROM users\n WHERE active;';
  await page.getByTestId('empty-new-snippet').click();
  await page.getByTestId('snippet-title').fill('Usuarios activos');
  await page.getByTestId('snippet-content').fill(content);
  await page.getByTestId('snippet-save').click();

  const card = page.getByTestId('snippet-card').filter({ hasText: 'Usuarios activos' });
  await expect(card).toBeVisible();
  await card.getByTestId('snippet-copy').click();
  await expect(card.getByTestId('snippet-copied')).toBeVisible();
  expect(await app.evaluate(({ clipboard }) => clipboard.readText())).toBe(content);

  await app.close();
  launched = await launchApp(dataDir);
  await launched.page.getByRole('link', { name: 'Snippets' }).click();
  await expect(
    launched.page.getByTestId('snippet-card').filter({ hasText: 'Usuarios activos' }),
  ).toBeVisible();
});

test('CP-13-23: the Lista view survives a restart, search by tag narrows and Copiar fills the clipboard', async () => {
  const { page, app, dataDir } = launched;
  const create = async (title: string, content: string, tag: string) => {
    await page.getByTestId('new-snippet').click();
    await page.getByTestId('snippet-title').fill(title);
    await page.getByTestId('snippet-content').fill(content);
    await page.getByTestId('tag-input').fill(tag);
    await page.getByTestId('tag-add').click();
    await page.getByTestId('snippet-save').click();
  };
  await create('Usuarios', 'SELECT 1;', 'zzz');
  await create('Logs', 'tail -f app.log', 'ops');

  await page.getByTestId('view-list').click();
  await app.close();
  launched = await launchApp(dataDir);
  const next = launched.page;
  await next.getByRole('link', { name: 'Snippets' }).click();
  await expect(next.getByTestId('snippet-list')).toHaveAttribute('data-view', 'list');

  await next.getByTestId('snippet-search').fill('ops');
  await expect(next.getByTestId('snippet-card')).toHaveCount(1);
  await next.getByTestId('snippet-copy').click();
  expect(await launched.app.evaluate(({ clipboard }) => clipboard.readText())).toBe(
    'tail -f app.log',
  );
});
