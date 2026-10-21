import path from 'node:path';
import { app, BrowserWindow, Menu } from 'electron';
import type Database from 'better-sqlite3';
import { appNameFor, CHANNEL, resolveDataDir } from './channel';
import { openDatabase } from './db/database';
import { registerIpcHandlers } from './ipc/register';
import { registerAppScheme, serveRenderer } from './protocol';
import { createMainWindow } from './window';

const appName = appNameFor(CHANNEL);
const dataDir = resolveDataDir(app.getPath('appData'), CHANNEL, process.env['ORQ_DATA_DIR']);

// Set before anything reads userData, so dev and prod never share a profile.
app.setName(appName);
app.setPath('userData', dataDir);

registerAppScheme();

let db: Database.Database | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    db = openDatabase(dataDir);
    registerIpcHandlers(db);
    serveRenderer(path.join(__dirname, '../renderer/browser'));
    createMainWindow(appName);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(appName);
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  db?.close();
});
