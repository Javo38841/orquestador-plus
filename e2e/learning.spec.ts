import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
  await launched.page.getByRole('link', { name: 'Aprendizaje' }).click();
});

test.afterEach(async () => {
  await launched.close();
});

test('CP-14-11: a topic marked "En curso" survives restarting the app', async () => {
  const { page, app, dataDir } = launched;
  await page.getByTestId('empty-new-topic').click();
  await page.getByTestId('topic-title').fill('Rust');
  await page.getByTestId('topic-save').click();

  const card = page.getByTestId('topic-card').filter({ hasText: 'Rust' });
  await expect(card).toBeVisible();
  await card.getByTestId('topic-status').selectOption('in_progress');
  await expect(card.getByTestId('topic-status-chip')).toHaveText('En curso');

  await app.close();
  launched = await launchApp(dataDir);
  await launched.page.getByRole('link', { name: 'Aprendizaje' }).click();
  const again = launched.page.getByTestId('topic-card').filter({ hasText: 'Rust' });
  await expect(again).toBeVisible();
  await expect(again.getByTestId('topic-status-chip')).toHaveText('En curso');
});
