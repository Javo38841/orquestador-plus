import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.stubGlobal('__CHANNEL__', 'dev');

const { appNameFor, resolveDataDir } = await import('./channel');

describe('channel', () => {
  it('gives dev and prod different app names', () => {
    expect(appNameFor('dev')).toBe('OrquestadorPlus Dev');
    expect(appNameFor('prod')).toBe('OrquestadorPlus');
  });

  it('keeps dev and prod data in separate folders', () => {
    const appData = path.resolve('/home/user/.config');
    expect(resolveDataDir(appData, 'dev', undefined)).not.toBe(
      resolveDataDir(appData, 'prod', undefined),
    );
  });

  it('uses ORQ_DATA_DIR when provided', () => {
    expect(resolveDataDir('/ignored', 'prod', '/tmp/e2e')).toBe(path.resolve('/tmp/e2e'));
  });
});
