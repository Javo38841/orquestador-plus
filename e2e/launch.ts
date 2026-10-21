import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/** Path of the unpacked Dev build produced by `npm run package:dir`. */
function packagedExecutable(): string {
  const release = path.resolve(__dirname, '..', 'release');
  switch (process.platform) {
    case 'win32':
      return path.join(release, 'win-unpacked', 'orquestador-plus-dev.exe');
    case 'darwin':
      return path.join(
        release,
        'mac',
        'OrquestadorPlus Dev.app',
        'Contents',
        'MacOS',
        'OrquestadorPlus Dev',
      );
    default:
      return path.join(release, 'linux-unpacked', 'orquestador-plus-dev');
  }
}

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  dataDir: string;
  close(): Promise<void>;
}

/**
 * Launches the packaged app against a throwaway data folder, or against an
 * existing one (`dataDir`) to simulate closing and reopening the app.
 */
export async function launchApp(existingDataDir?: string): Promise<LaunchedApp> {
  const executablePath = packagedExecutable();
  if (!fs.existsSync(executablePath)) {
    throw new Error(
      `Packaged app not found at ${executablePath}. Run "npm run package:dir" first.`,
    );
  }

  const dataDir = existingDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'orq-e2e-'));
  const app = await electron.launch({
    executablePath,
    // CI runners cannot use Chromium's setuid sandbox; the renderer sandbox stays on.
    args: process.platform === 'linux' ? ['--no-sandbox'] : [],
    env: { ...process.env, ORQ_DATA_DIR: dataDir },
  });
  const page = await app.firstWindow();

  return {
    app,
    page,
    dataDir,
    close: async () => {
      await app.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
