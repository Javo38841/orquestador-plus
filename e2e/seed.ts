import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Fills a data folder with the "years of use" volume (RNF-05) using the bundled seeder, run
 * inside Electron's Node because better-sqlite3 is built for Electron's ABI, not Node's.
 */
export function seedLargeVolume(dataDir: string): void {
  const root = path.resolve(__dirname, '..');
  const electron = createRequire(__filename)('electron') as unknown as string;
  execFileSync(electron, [path.join(root, 'dist', 'seed', 'seed.js'), dataDir], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: 'pipe',
  });
}
