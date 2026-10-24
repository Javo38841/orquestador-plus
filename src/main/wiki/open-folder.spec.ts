import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { openWikiFolder } from './open-folder';

describe('openWikiFolder', () => {
  it('CP-08-111: asks the system to open the wiki folder, creating it if missing', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-open-'));
    const dir = path.join(root, 'wiki');
    const open = vi.fn(async () => '');
    try {
      expect(await openWikiFolder(dir, open)).toBe(true);
      expect(open).toHaveBeenCalledWith(dir);
      expect(fs.existsSync(dir)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('CP-08-111: resolves false when the system cannot open it', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-open-'));
    try {
      expect(await openWikiFolder(path.join(root, 'w'), async () => 'no app')).toBe(false);
      expect(
        await openWikiFolder(path.join(root, 'w'), async () => {
          throw new Error('boom');
        }),
      ).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
