import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('csv', () => {
  it('CP-11-04: commas, quotes, line breaks and accents are escaped and read back identical', () => {
    const rows = [
      [1, 'a,b', 'dice "hola"', 'línea 1\nlínea 2'],
      [2, 'ñandú ✓ 日本', 'crlf\r\nbreak', null],
      [3, '', ' espacios ', '"'],
    ];
    const text = toCsv(['id', 'a', 'b', 'c'], rows);
    expect(text).toContain('"a,b"');
    expect(text).toContain('"dice ""hola"""');
    expect(text.endsWith('\r\n')).toBe(true);

    const back = parseCsv(Buffer.from(text, 'utf8').toString('utf8'));
    expect(back).toEqual([
      ['id', 'a', 'b', 'c'],
      ...rows.map((row) => row.map((v) => (v === null ? '' : String(v)))),
    ]);
  });

  it('CP-11-05: no rows gives only the header line', () => {
    expect(toCsv(['id', 'title'], [])).toBe('id,title\r\n');
    expect(parseCsv('id,title\r\n')).toEqual([['id', 'title']]);
  });
});
