import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ net: {}, protocol: {} }));

const { resolveRendererFile } = await import('./protocol');

const root = path.resolve('/app/renderer');
const existing = new Set([path.join(root, 'index.html'), path.join(root, 'main-ABC.js')]);
const isFile = (file: string) => existing.has(file);

describe('resolveRendererFile', () => {
  it('serves an existing asset', () => {
    expect(resolveRendererFile(root, '/main-ABC.js', isFile)).toBe(path.join(root, 'main-ABC.js'));
  });

  it('falls back to index.html for router paths', () => {
    expect(resolveRendererFile(root, '/tasks', isFile)).toBe(path.join(root, 'index.html'));
    expect(resolveRendererFile(root, '/', isFile)).toBe(path.join(root, 'index.html'));
  });

  it('never resolves outside the renderer folder', () => {
    for (const attempt of ['/../main/main.js', '/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2fsecret']) {
      const file = resolveRendererFile(root, attempt, () => true);
      expect(file === null || file.startsWith(root + path.sep)).toBe(true);
    }
  });
});
