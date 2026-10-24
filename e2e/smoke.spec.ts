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
      'attachFile',
      'captureInbox',
      'convertInboxItem',
      'copyToClipboard',
      'createBug',
      'createNote',
      'createPortalLink',
      'createProject',
      'createSection',
      'createSnippet',
      'createTask',
      'createTopic',
      'deleteBug',
      'deleteNote',
      'deleteProject',
      'deleteSeries',
      'deleteSnippet',
      'deleteTask',
      'deleteTopic',
      'discardInboxItem',
      'exportAll',
      'getAppInfo',
      'getBoardPanelOpen',
      'getBoardProject',
      'getNote',
      'getPortalStatus',
      'getRemindersEnabled',
      'getSnippetsView',
      'hideFromToday',
      'listBugs',
      'listInbox',
      'listJournal',
      'listNotes',
      'listPortalLinks',
      'listProjects',
      'listSections',
      'listSkippedFiles',
      'listSnippets',
      'listTags',
      'listTasks',
      'listTopics',
      'moveNote',
      'onWikiChanged',
      'openAttachment',
      'openWikiFolder',
      'readAttachment',
      'revokePortalLink',
      'saveJournalEntry',
      'search',
      'setBoardPanelOpen',
      'setBoardProject',
      'setBugStatus',
      'setPortalEnabled',
      'setRemindersEnabled',
      'setSnippetsView',
      'setTaskForToday',
      'setTaskStatus',
      'setTopicStatus',
      'updateBug',
      'updateNote',
      'updateSnippet',
      'updateTask',
      'updateTopic',
    ],
  });
});

test('CP-N09-01: first launch on a missing data folder needs no setup', async () => {
  const missing = path.join(launched.dataDir, 'nested', 'primera-vez');
  const first = await launchApp(missing);
  try {
    await expect(first.page.getByRole('heading', { level: 1, name: 'Hoy' })).toBeVisible();
    await expect(first.page.getByRole('dialog')).toHaveCount(0);
    expect(fs.existsSync(path.join(missing, 'datos.db'))).toBe(true);
    expect(fs.statSync(path.join(missing, 'wiki')).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(missing, 'adjuntos')).isDirectory()).toBe(true);
  } finally {
    await first.close();
  }
});
