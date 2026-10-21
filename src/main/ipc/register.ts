import { app, ipcMain } from 'electron';
import type Database from 'better-sqlite3';
import { IpcChannel, type AppInfo } from '../../shared/ipc';
import { CHANNEL } from '../channel';

export function registerIpcHandlers(db: Database.Database | null): void {
  ipcMain.handle(IpcChannel.getAppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    channel: CHANNEL,
    platform: process.platform,
    databaseReady: db?.open ?? false,
  }));
}
