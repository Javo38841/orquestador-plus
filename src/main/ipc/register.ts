import { app, ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { IpcChannel, type AppInfo } from '../../shared/ipc';
import { CHANNEL } from '../channel';
import { captureItem, listInbox } from '../inbox/inbox';

export function registerIpcHandlers(db: Database.Database | null): void {
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
}
