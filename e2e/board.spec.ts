import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

async function addTask(page: LaunchedApp['page'], title: string, project?: string) {
  await page.getByTestId('new-task').click();
  await page.getByTestId('task-title').fill(title);
  if (project) {
    await page.getByTestId('task-project').selectOption('new');
    await page.getByTestId('task-new-project').fill(project);
  }
  await page.getByTestId('task-save').click();
  await expect(page.getByTestId('task-row').filter({ hasText: title })).toBeVisible();
}

const column = (page: LaunchedApp['page'], status: string) =>
  page.locator(`[data-testid="board-column"][data-status="${status}"]`);

async function moveCard(page: LaunchedApp['page'], title: string, target: string) {
  const card = page.getByTestId('board-card').filter({ hasText: title });
  await card.getByTestId('board-move').click();
  await card.locator(`[data-testid="board-move-option"][data-status="${target}"]`).click();
}

test('CP-04-01: Tablero shows the three columns with counts and each task in its column', async () => {
  const { page } = launched;
  await page.getByRole('link', { name: 'Tareas' }).click();
  await addTask(page, 'Suelta pendiente');
  await addTask(page, 'Con proyecto', 'api-gateway');
  await addTask(page, 'Ya terminada');
  await page
    .getByTestId('task-row')
    .filter({ hasText: 'Ya terminada' })
    .getByTestId('task-check')
    .check();

  await page.getByRole('link', { name: 'Tablero' }).click();
  await moveCard(page, 'Con proyecto', 'in_progress');

  await expect(column(page, 'todo').getByTestId('board-count')).toHaveText('1');
  await expect(column(page, 'in_progress').getByTestId('board-count')).toHaveText('1');
  await expect(column(page, 'done').getByTestId('board-count')).toHaveText('1');
  await expect(column(page, 'todo')).toContainText('Suelta pendiente');
  await expect(column(page, 'todo')).toContainText('Suelta');
  await expect(column(page, 'in_progress')).toContainText('Con proyecto');
  await expect(column(page, 'in_progress')).toContainText('api-gateway');
  await expect(column(page, 'done')).toContainText('Ya terminada');
});

test('CP-04-02: a card moved to "En curso" is still there after reopening the app', async () => {
  const { page, app, dataDir } = launched;
  await page.getByRole('link', { name: 'Tareas' }).click();
  await addTask(page, 'Persistir columna');
  await page.getByRole('link', { name: 'Tablero' }).click();
  await moveCard(page, 'Persistir columna', 'in_progress');
  await expect(column(page, 'in_progress')).toContainText('Persistir columna');

  await app.close();
  const reopened = await launchApp(dataDir);
  launched = reopened;
  await reopened.page.getByRole('link', { name: 'Tablero' }).click();
  await expect(column(reopened.page, 'in_progress')).toContainText('Persistir columna');
  await expect(column(reopened.page, 'todo')).not.toContainText('Persistir columna');
});
