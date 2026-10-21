import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp, type LaunchedApp } from './launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
  launched = await launchApp();
});

test.afterEach(async () => {
  await launched.close();
});

test('smoke: the packaged app starts with its database ready', async () => {
  const { page, dataDir } = launched;

  await expect(page.getByRole('heading', { level: 1, name: 'Hoy' })).toBeVisible();
  await expect(page.getByTestId('database-status')).toHaveText('Base de datos lista');
  await expect(page.getByTestId('dev-banner')).toBeVisible();
  expect(fs.existsSync(path.join(dataDir, 'datos.db'))).toBe(true);
});

test('smoke: navigation survives a reload through app://', async () => {
  const { page } = launched;

  await page.getByRole('link', { name: 'Tareas' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tareas' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Tareas' })).toBeVisible();
  expect(page.url()).toBe('app://bundle/tasks');
});

test('ADR-003: the renderer has no access to Node', async () => {
  const { page } = launched;

  const exposed = await page.evaluate(() => {
    const w = window as unknown as { require?: unknown; process?: unknown; orquestador?: object };
    return {
      require: typeof w.require,
      process: typeof w.process,
      api: Object.keys(w.orquestador ?? {}).sort(),
    };
  });

  expect(exposed).toEqual({
    require: 'undefined',
    process: 'undefined',
    api: [
      'captureInbox',
      'convertInboxItem',
      'createProject',
      'createTask',
      'deleteProject',
      'deleteTask',
      'discardInboxItem',
      'getAppInfo',
      'listInbox',
      'listProjects',
      'listTags',
      'listTasks',
      'setTaskForToday',
      'setTaskStatus',
      'updateTask',
    ],
  });
});
