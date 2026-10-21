import path from 'node:path';
import { BrowserWindow, shell } from 'electron';
import { APP_ORIGIN } from './protocol';

/** Dev server URL when running `npm run dev`; unset in packaged builds. */
const DEV_SERVER_URL = process.env['ELECTRON_RENDERER_URL'];

export function createMainWindow(title: string): BrowserWindow {
  const win = new BrowserWindow({
    title,
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0f1218',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  const allowedOrigin = DEV_SERVER_URL ? new URL(DEV_SERVER_URL).origin : APP_ORIGIN;

  // External links open in the system browser; the app never opens new windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== allowedOrigin) event.preventDefault();
  });
  win.on('page-title-updated', (event) => event.preventDefault());
  win.once('ready-to-show', () => win.show());

  void win.loadURL(DEV_SERVER_URL ?? `${APP_ORIGIN}/`);
  return win;
}
