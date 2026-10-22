import path from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { IpcChannel, type AppInfo } from '../../shared/ipc';
import { CHANNEL } from '../channel';
import { exportAll } from '../export/export';
import { createBug, deleteBug, listBugs, setBugStatus, updateBug } from '../bugs/bugs';
import { listJournal, saveJournalEntry } from '../journal/journal';
import { captureItem, convertToTask, discardItem, listInbox } from '../inbox/inbox';
import {
  createProject,
  createTask,
  deleteProject,
  deleteSeries,
  deleteTask,
  listProjects,
  listTags,
  listTasks,
  setTaskForToday,
  setTaskStatus,
  updateTask,
} from '../tasks/tasks';
import { createSnippet, deleteSnippet, listSnippets, updateSnippet } from '../snippets/snippets';
import { SNIPPET_CONTENT_MAX_LENGTH } from '../../shared/snippets';
import {
  createTopic,
  deleteTopic,
  listTopics,
  setTopicStatus,
  updateTopic,
} from '../learning/learning';
import { createLink, listLinks, revokeLink } from '../portal/links';
import type { PortalServer } from '../portal/server';
import { search } from '../search/search';
import type { ReminderScheduler } from '../reminders/scheduler';
import {
  getBoardProject,
  getRemindersEnabled,
  setBoardProject,
  setRemindersEnabled,
} from '../settings/settings';
import { createNote, deleteNote, getNote, listNotes, updateNote, type Wiki } from '../wiki/wiki';

export function registerIpcHandlers(
  db: Database.Database | null,
  wikiDir: string,
  reminders: Pick<ReminderScheduler, 'refresh'> = { refresh: () => undefined },
  portal: PortalServer | null = null,
): void {
  ipcMain.handle(IpcChannel.getAppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    channel: CHANNEL,
    platform: process.platform,
    databaseReady: db?.open ?? false,
  }));

  ipcMain.handle(IpcChannel.captureInbox, (_event, text: unknown) => {
    if (!db) throw new Error('Database not available');
    return captureItem(db, text);
  });
  ipcMain.handle(IpcChannel.listInbox, () => {
    if (!db) throw new Error('Database not available');
    return listInbox(db);
  });

  const withDb = <T>(run: (database: Database.Database) => T): T => {
    if (!db) throw new Error('Database not available');
    return run(db);
  };
  ipcMain.handle(IpcChannel.convertInboxItem, (_event, id: unknown, input: unknown) =>
    withDb((d) => convertToTask(d, id, input)),
  );
  ipcMain.handle(IpcChannel.discardInboxItem, (_event, id: unknown) =>
    withDb((d) => discardItem(d, id)),
  );
  ipcMain.handle(IpcChannel.listTasks, () => withDb(listTasks));
  // Anything that can change a task's reminder re-arms the scheduler's single timer.
  const rearm = <T>(result: T): T => {
    reminders.refresh();
    return result;
  };
  ipcMain.handle(IpcChannel.createTask, (_event, input: unknown) =>
    rearm(withDb((d) => createTask(d, input))),
  );
  ipcMain.handle(IpcChannel.updateTask, (_event, id: unknown, input: unknown) =>
    rearm(withDb((d) => updateTask(d, id, input))),
  );
  ipcMain.handle(IpcChannel.setTaskStatus, (_event, id: unknown, status: unknown) =>
    rearm(withDb((d) => setTaskStatus(d, id, status))),
  );
  ipcMain.handle(IpcChannel.setTaskForToday, (_event, id: unknown, forToday: unknown) =>
    withDb((d) => setTaskForToday(d, id, forToday)),
  );
  ipcMain.handle(IpcChannel.deleteTask, (_event, id: unknown) =>
    rearm(withDb((d) => deleteTask(d, id))),
  );
  ipcMain.handle(IpcChannel.deleteSeries, (_event, id: unknown) =>
    rearm(withDb((d) => deleteSeries(d, id))),
  );
  ipcMain.handle(IpcChannel.listTags, () => withDb(listTags));
  ipcMain.handle(IpcChannel.listProjects, () => withDb(listProjects));
  ipcMain.handle(IpcChannel.createProject, (_event, name: unknown) =>
    withDb((d) => createProject(d, name)),
  );
  ipcMain.handle(IpcChannel.deleteProject, (_event, id: unknown) =>
    withDb((d) => deleteProject(d, id)),
  );

  const withWiki = <T>(run: (wiki: Wiki) => T): T => {
    if (!db) throw new Error('Database not available');
    return run({ db, dir: wikiDir });
  };
  ipcMain.handle(IpcChannel.listNotes, () => withWiki(listNotes));
  ipcMain.handle(IpcChannel.getNote, (_event, slug: unknown) => withWiki((w) => getNote(w, slug)));
  ipcMain.handle(IpcChannel.createNote, (_event, input: unknown) =>
    withWiki((w) => createNote(w, input)),
  );
  ipcMain.handle(IpcChannel.updateNote, (_event, slug: unknown, input: unknown) =>
    withWiki((w) => updateNote(w, slug, input)),
  );
  ipcMain.handle(IpcChannel.deleteNote, (_event, slug: unknown) =>
    withWiki((w) => deleteNote(w, slug)),
  );

  ipcMain.handle(IpcChannel.listBugs, () => withDb(listBugs));
  ipcMain.handle(IpcChannel.createBug, (_event, input: unknown) =>
    withDb((d) => createBug(d, input)),
  );
  ipcMain.handle(IpcChannel.updateBug, (_event, id: unknown, input: unknown) =>
    withDb((d) => updateBug(d, id, input)),
  );
  ipcMain.handle(IpcChannel.setBugStatus, (_event, id: unknown, status: unknown) =>
    withDb((d) => setBugStatus(d, id, status)),
  );
  ipcMain.handle(IpcChannel.deleteBug, (_event, id: unknown) => withDb((d) => deleteBug(d, id)));

  ipcMain.handle(IpcChannel.listSnippets, () => withDb(listSnippets));
  ipcMain.handle(IpcChannel.createSnippet, (_event, input: unknown) =>
    withDb((d) => createSnippet(d, input)),
  );
  ipcMain.handle(IpcChannel.updateSnippet, (_event, id: unknown, input: unknown) =>
    withDb((d) => updateSnippet(d, id, input)),
  );
  ipcMain.handle(IpcChannel.deleteSnippet, (_event, id: unknown) =>
    withDb((d) => deleteSnippet(d, id)),
  );
  ipcMain.handle(IpcChannel.copyToClipboard, (_event, text: unknown) => {
    if (typeof text !== 'string' || text.length > SNIPPET_CONTENT_MAX_LENGTH) return false;
    clipboard.writeText(text);
    return true;
  });

  ipcMain.handle(IpcChannel.listTopics, () => withDb(listTopics));
  ipcMain.handle(IpcChannel.createTopic, (_event, input: unknown) =>
    withDb((d) => createTopic(d, input)),
  );
  ipcMain.handle(IpcChannel.updateTopic, (_event, id: unknown, input: unknown) =>
    withDb((d) => updateTopic(d, id, input)),
  );
  ipcMain.handle(IpcChannel.setTopicStatus, (_event, id: unknown, status: unknown) =>
    withDb((d) => setTopicStatus(d, id, status)),
  );
  ipcMain.handle(IpcChannel.deleteTopic, (_event, id: unknown) =>
    withDb((d) => deleteTopic(d, id)),
  );

  ipcMain.handle(IpcChannel.listJournal, () => withDb(listJournal));
  ipcMain.handle(IpcChannel.saveJournalEntry, (_event, date: unknown, text: unknown) =>
    withDb((d) => saveJournalEntry(d, date, text)),
  );

  ipcMain.handle(IpcChannel.search, (_event, text: unknown) => withDb((d) => search(d, text)));

  const withPortal = <T>(run: (server: PortalServer) => T): T => {
    if (!portal) throw new Error('Portal not available');
    return run(portal);
  };
  ipcMain.handle(IpcChannel.getPortalStatus, () => withPortal((p) => p.status()));
  ipcMain.handle(IpcChannel.setPortalEnabled, (_event, enabled: unknown) => {
    if (typeof enabled !== 'boolean') throw new Error('Invalid portal setting');
    return withPortal((p) => (enabled ? p.start() : p.stop()));
  });
  ipcMain.handle(IpcChannel.listPortalLinks, () => withDb((d) => listLinks(d)));
  ipcMain.handle(IpcChannel.createPortalLink, (_event, input: unknown) =>
    withDb((d) => createLink(d, input)),
  );
  ipcMain.handle(IpcChannel.revokePortalLink, (_event, id: unknown) =>
    withDb((d) => revokeLink(d, id)),
  );

  ipcMain.handle(IpcChannel.getBoardProject, () => withDb(getBoardProject));
  ipcMain.handle(IpcChannel.setBoardProject, (_event, id: unknown) =>
    withDb((d) => setBoardProject(d, id)),
  );
  ipcMain.handle(IpcChannel.getRemindersEnabled, () => withDb(getRemindersEnabled));
  ipcMain.handle(IpcChannel.setRemindersEnabled, (_event, enabled: unknown) =>
    rearm(withDb((d) => setRemindersEnabled(d, enabled))),
  );

  // The payload is forwarded untouched: exportAll rejects anything but no argument.
  ipcMain.handle(IpcChannel.exportAll, (event, payload?: unknown) =>
    exportAll(
      {
        db,
        wikiDir,
        chooseFile: async (defaultName) => {
          const options = {
            defaultPath: path.join(app.getPath('documents'), defaultName),
            filters: [{ name: 'ZIP', extensions: ['zip'] }],
          };
          const parent = BrowserWindow.fromWebContents(event.sender);
          const { canceled, filePath } = parent
            ? await dialog.showSaveDialog(parent, options)
            : await dialog.showSaveDialog(options);
          return canceled || !filePath ? null : filePath;
        },
      },
      payload,
    ),
  );
}
