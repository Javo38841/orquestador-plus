import { describe, expect, it } from 'vitest';
import { createZip, readZip } from './zip';

describe('zip', () => {
  it('stores entries with UTF-8 names and content that read back identical', () => {
    const entries = [
      { name: 'tareas.json', data: Buffer.from('[{"título":"añadir"}]', 'utf8') },
      { name: 'wiki/nota ñ.md', data: Buffer.from('---\ntitle: "x"\n---\n\ntexto'.repeat(50)) },
      { name: 'vacío.csv', data: Buffer.alloc(0) },
    ];
    expect(readZip(createZip(entries))).toEqual(entries);
  });

  it('an archive without entries is still valid', () => {
    expect(readZip(createZip([]))).toEqual([]);
  });
});
