import path from 'node:path';
import { app, BrowserWindow, Menu, Notification } from 'electron';
import type Database from 'better-sqlite3';
import { appNameFor, CHANNEL, resolveDataDir } from './channel';
import { initStorage } from './storage';
import { registerIpcHandlers } from './ipc/register';
import { createReminderScheduler, type ReminderScheduler } from './reminders/scheduler';
import { createPortalServer, type PortalServer } from './portal/server';
import { rebuildIndex } from './wiki/wiki';
import { registerAppScheme, serveRenderer } from './protocol';
import { createMainWindow } from './window';

const appName = appNameFor(CHANNEL);
const dataDir = resolveDataDir(app.getPath('appData'), CHANNEL, process.env['ORQ_DATA_DIR']);

// Set before anything reads userData, so dev and prod never share a profile.
app.setName(appName);
app.setPath('userData', dataDir);

registerAppScheme();

let db: Database.Database | null = null;
let reminders: ReminderScheduler | null = null;
let portal: PortalServer | null = null;
// Notifications must stay referenced until shown or they may be garbage collected.
const shownNotifications = new Set<Notification>();

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
    const storage = initStorage(dataDir);
    db = storage.db;
    const { wikiDir } = storage;
    // Files are the source of truth (ADR-001): the index is rebuilt on every start.
    rebuildIndex({ db, dir: wikiDir });
    reminders = createReminderScheduler({
      db,
      notify: (content) => {
        // Where the system has no notification service, show() does nothing.
        const notification = new Notification(content);
        shownNotifications.add(notification);
        notification.on('close', () => shownNotifications.delete(notification));
        notification.show();
      },
    });
    // Created off: nothing listens until the user turns the portal on (RF-15).
    portal = createPortalServer({ db });
    registerIpcHandlers(db, wikiDir, reminders, portal);
    serveRenderer(path.join(__dirname, '../renderer/browser'));
    createMainWindow(appName);
    // After the window exists, so overdue reminders from while the app was closed show now.
    reminders.start();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(appName);
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  reminders?.stop();
  void portal?.stop();
  db?.close();
});
