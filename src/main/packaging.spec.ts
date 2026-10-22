import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const read = (file: string): string => fs.readFileSync(path.join(root, file), 'utf8');

describe('packaging configuration', () => {
  it('CP-N09-05: builds an NSIS installer, an AppImage and an RPM', () => {
    const config = read('electron-builder.yml');

    expect(config).toMatch(/^win:\s*\n\s+target: nsis$/m);
    expect(config).toMatch(/^linux:\s*\n\s+target:\s*\n\s+- AppImage\s*\n\s+- rpm$/m);
    // A single downloadable file per format: no archives, no unpacked folders.
    expect(config).not.toMatch(/target:\s*(zip|dir|7z|tar)/);
  });

  it('CP-N09-06: the Windows installer is per user and bundles its runtime', () => {
    const config = read('electron-builder.yml');

    expect(config).toMatch(/^\s+perMachine: false$/m);
    expect(config).not.toMatch(/requestedExecutionLevel:\s*requireAdministrator/);
    // Electron ships Node: the app must not depend on a separately installed runtime.
    const pkg = JSON.parse(read('package.json')) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain('electron');
  });
});
