import { app, ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { IpcChannel, type AppInfo } from '../../shared/ipc';
import { CHANNEL } from '../channel';
import { createBug, deleteBug, listBugs, setBugStatus, updateBug } from '../bugs/bugs';
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
import { createNote, deleteNote, getNote, listNotes, updateNote, type Wiki } from '../wiki/wiki';

export function registerIpcHandlers(db: Database.Database | null, wikiDir: string): void {
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
  ipcMain.handle(IpcChannel.createTask, (_event, input: unknown) =>
    withDb((d) => createTask(d, input)),
  );
  ipcMain.handle(IpcChannel.updateTask, (_event, id: unknown, input: unknown) =>
    withDb((d) => updateTask(d, id, input)),
  );
  ipcMain.handle(IpcChannel.setTaskStatus, (_event, id: unknown, status: unknown) =>
    withDb((d) => setTaskStatus(d, id, status)),
  );
  ipcMain.handle(IpcChannel.setTaskForToday, (_event, id: unknown, forToday: unknown) =>
    withDb((d) => setTaskForToday(d, id, forToday)),
  );
  ipcMain.handle(IpcChannel.deleteTask, (_event, id: unknown) => withDb((d) => deleteTask(d, id)));
  ipcMain.handle(IpcChannel.deleteSeries, (_event, id: unknown) =>
    withDb((d) => deleteSeries(d, id)),
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
}
