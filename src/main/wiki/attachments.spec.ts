import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATTACHMENT_MAX_BYTES } from '../../shared/attachments';
import { IpcChannel } from '../../shared/ipc';
import { openDatabase } from '../db/database';
import { buildExport } from '../export/export';
import { readZip } from '../export/zip';
import { registerIpcHandlers } from '../ipc/register';
import { attachFile, openAttachment, readAttachment } from './attachments';
import {
  createNote,
  createSection,
  deleteNote,
  getNote,
  rebuildIndex,
  updateNote,
  type Wiki,
} from './wiki';

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
vi.mock('../channel', () => ({ CHANNEL: 'dev' }));
vi.mock('electron', () => ({
  app: { getName: () => 'x', getVersion: () => '0' },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn),
  },
  shell: { openPath: vi.fn(async () => '') },
}));

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

describe('wiki attachments', () => {
  let root: string;
  let db: Database.Database;
  let wiki: Wiki;

  const make = (title: string, section?: string, content = '') => {
    const result = createNote(wiki, { title, content, ...(section && { section }) });
    if (!result.ok) throw new Error(result.error);
  };
  const names = (rel: string) => fs.readdirSync(path.join(wiki.dir, rel)).sort();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-attach-'));
    db = openDatabase(root);
    wiki = { db, dir: path.join(root, 'wiki') };
    handlers.clear();
  });
  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('CP-08-116: an image is copied to <note>.assets/ and an image link is returned', () => {
    expect(createSection(wiki, { title: 'Guías' }).ok).toBe(true);
    make('instalacion', 'Guías');

    const result = attachFile(wiki, { slug: 'Guías/instalacion', name: 'captura.png', data: PNG });

    expect(result).toEqual({
      ok: true,
      link: '![captura](instalacion.assets/captura.png)',
      name: 'captura.png',
    });
    const stored = path.join(wiki.dir, 'Guías', 'instalacion.assets', 'captura.png');
    expect(fs.readFileSync(stored)).toEqual(Buffer.from(PNG));
  });

  it('CP-08-117: a file that is not an image gets a plain link', () => {
    make('instalacion');

    const result = attachFile(wiki, { slug: 'instalacion', name: 'manual.pdf', data: PNG });

    expect(result).toMatchObject({ ok: true, link: '[manual.pdf](instalacion.assets/manual.pdf)' });
  });

  it('CP-08-117: spaces in the note name are escaped in the link', () => {
    make('Mi nota');
    const result = attachFile(wiki, { slug: 'Mi nota', name: 'a.png', data: PNG });
    expect(result).toMatchObject({ link: '![a](Mi%20nota.assets/a.png)' });
  });

  it('CP-08-118: a name already taken is stored as captura-1.png and nothing is overwritten', () => {
    make('n');
    attachFile(wiki, { slug: 'n', name: 'captura.png', data: new Uint8Array([1]) });

    const again = attachFile(wiki, { slug: 'n', name: 'captura.png', data: new Uint8Array([2]) });
    const third = attachFile(wiki, { slug: 'n', name: 'CAPTURA.png', data: new Uint8Array([3]) });

    expect(again).toMatchObject({ ok: true, name: 'captura-1.png' });
    expect(third).toMatchObject({ ok: true, name: 'CAPTURA-2.png' });
    expect(names('n.assets')).toEqual(['CAPTURA-2.png', 'captura-1.png', 'captura.png']);
    expect([...fs.readFileSync(path.join(wiki.dir, 'n.assets', 'captura.png'))]).toEqual([1]);
  });

  it('CP-08-119: separators, .. and invalid characters are sanitized; the file stays inside', () => {
    make('n');
    const hostile = [
      '../../evil.png',
      '..\\..\\evil.png',
      'a/../../b.png',
      '..',
      'C:\\x\\y?.png',
      'a b*.txt',
    ];

    for (const name of hostile) {
      const result = attachFile(wiki, { slug: 'n', name, data: PNG });
      expect(result.ok).toBe(true);
    }

    expect(fs.existsSync(path.join(root, 'evil.png'))).toBe(false);
    expect(fs.existsSync(path.join(wiki.dir, 'evil.png'))).toBe(false);
    for (const stored of names('n.assets')) expect(stored).not.toMatch(/[\\/:*?"<>|]|\.\./);
    expect(names('n.assets')).toHaveLength(hostile.length);
    expect(names('.')).toEqual(['n.assets', 'n.md']);
  });

  it('CP-08-120: a file over the limit is rejected and no file is created', () => {
    make('n');
    const big = new Uint8Array(ATTACHMENT_MAX_BYTES + 1);

    expect(attachFile(wiki, { slug: 'n', name: 'big.png', data: big })).toEqual({
      ok: false,
      error: 'too_large',
    });
    expect(fs.existsSync(path.join(wiki.dir, 'n.assets'))).toBe(false);
    const exact = new Uint8Array(ATTACHMENT_MAX_BYTES);
    expect(attachFile(wiki, { slug: 'n', name: 'ok.bin', data: exact }).ok).toBe(true);
  });

  it('CP-08-121: invalid payloads are rejected without writing anything', () => {
    make('n');
    const outside = path.join(root, 'outside');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(wiki.dir, 'n.assets'));
    make('m');
    fs.rmSync(path.join(wiki.dir, 'm.md'));
    fs.writeFileSync(path.join(root, 'real.md'), 'x');
    make('s');
    fs.rmSync(path.join(wiki.dir, 's.md'));
    fs.symlinkSync(path.join(root, 'real.md'), path.join(wiki.dir, 's.md'));

    const cases: unknown[] = [
      null,
      'x',
      { slug: 'nope', name: 'a.png', data: PNG },
      { slug: '../x', name: 'a.png', data: PNG },
      { slug: 'sub/n', name: 'a.png', data: PNG },
      { slug: 'n', name: 'a.png', data: new Uint8Array(0) },
      { slug: 'n', name: 'a.png', data: 'texto' },
      { slug: 'n', name: 7, data: PNG },
      { slug: 'n', name: 'a.png', data: PNG }, // assets folder is a symbolic link
      { slug: 's', name: 'a.png', data: PNG }, // the note itself is a symbolic link
      { slug: 'm', name: 'a.png', data: PNG }, // note file is gone
    ];
    for (const input of cases) expect(attachFile(wiki, input).ok).toBe(false);

    expect(fs.readdirSync(outside)).toEqual([]);
    expect(fs.existsSync(path.join(wiki.dir, 's.assets'))).toBe(false);
    expect(attachFile(wiki, { slug: 'n', name: 'a', data: new Uint8Array(0) })).toEqual({
      ok: false,
      error: 'empty',
    });
  });

  it('CP-08-121: the IPC handler validates the payload before main touches the disk', async () => {
    make('n');
    registerIpcHandlers(db, wiki.dir);

    const attach = handlers.get(IpcChannel.attachFile)!;
    expect(await attach({}, { slug: '../n', name: 'a.png', data: PNG })).toMatchObject({
      ok: false,
    });
    expect(await attach({}, 42)).toMatchObject({ ok: false });
    expect(await attach({}, { slug: 'n', name: 'a.png', data: PNG })).toMatchObject({ ok: true });
    expect(fs.existsSync(path.join(wiki.dir, '..', 'a.png'))).toBe(false);
  });

  it('CP-08-123: an image of the note is read as a data URL; only images are read', () => {
    make('n');
    attachFile(wiki, { slug: 'n', name: 'a.png', data: PNG });
    attachFile(wiki, { slug: 'n', name: 'm.pdf', data: PNG });

    const image = readAttachment(wiki, 'n', 'n.assets/a.png');

    expect(image).toEqual({
      ok: true,
      dataUrl: `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`,
    });
    expect(readAttachment(wiki, 'n', 'n.assets/m.pdf')).toEqual({ ok: false, error: 'invalid' });
  });

  it('CP-08-124: a linked file is opened by main only when it is inside wiki/', async () => {
    make('n');
    attachFile(wiki, { slug: 'n', name: 'm.pdf', data: PNG });
    attachFile(wiki, { slug: 'n', name: 'run.sh', data: PNG });
    fs.writeFileSync(path.join(root, 'secret.txt'), 'x');
    fs.symlinkSync(path.join(root, 'secret.txt'), path.join(wiki.dir, 'n.assets', 'link.txt'));
    const open = vi.fn(async () => '');

    expect(await openAttachment(wiki, 'n', 'n.assets/m.pdf', open)).toBe(true);
    expect(open).toHaveBeenCalledWith(path.join(wiki.dir, 'n.assets', 'm.pdf'));
    open.mockClear();

    for (const src of [
      '../secret.txt',
      '../../secret.txt',
      '/etc/passwd',
      'n.assets/link.txt', // symbolic link that leaves wiki/
      'n.assets/run.sh', // programs are never opened
      'n.assets/missing.pdf',
      'https://example.com/a.pdf',
      '%2e%2e/secret.txt',
    ]) {
      expect(await openAttachment(wiki, 'n', src, open)).toBe(false);
    }
    expect(await openAttachment(wiki, '../n', 'n.assets/m.pdf', open)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('CP-08-125: an image that does not exist is reported as not found', () => {
    make('n');
    expect(readAttachment(wiki, 'n', 'n.assets/missing.png')).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('CP-08-126: URLs, absolute paths and paths leaving wiki/ are never read', () => {
    make('n');
    fs.writeFileSync(path.join(root, 'x.png'), PNG);
    fs.writeFileSync(path.join(wiki.dir, '..', 'abs.png'), PNG);

    for (const src of [
      'https://example.com/a.png',
      'http://example.com/a.png',
      '//example.com/a.png',
      'file:///etc/passwd',
      'data:image/png;base64,AAAA',
      path.join(root, 'abs.png'),
      '../x.png',
      '../../x.png',
      'n.assets/../../x.png',
      'C:\\x.png',
    ]) {
      expect(readAttachment(wiki, 'n', src)).toEqual({ ok: false, error: 'invalid' });
    }
  });

  it('CP-08-127: renaming a note renames its assets folder and updates the links', () => {
    make('Viejo');
    const { link } = attachFile(wiki, { slug: 'Viejo', name: 'a.png', data: PNG }) as {
      link: string;
    };
    const saved = updateNote(wiki, 'Viejo', { title: 'Viejo', content: `Mira ${link}` });
    expect(saved.ok).toBe(true);

    const renamed = updateNote(wiki, 'Viejo', { title: 'Nuevo nombre', content: `Mira ${link}` });

    expect(renamed.ok).toBe(true);
    if (renamed.ok) expect(renamed.note.content).toBe('Mira ![a](Nuevo%20nombre.assets/a.png)');
    expect(fs.existsSync(path.join(wiki.dir, 'Viejo.assets'))).toBe(false);
    expect(names('Nuevo nombre.assets')).toEqual(['a.png']);
    expect(readAttachment(wiki, 'Nuevo nombre', 'Nuevo%20nombre.assets/a.png').ok).toBe(true);
  });

  it('CP-08-127: a rename that cannot move the assets leaves note and assets as they were', () => {
    make('Viejo');
    attachFile(wiki, { slug: 'Viejo', name: 'a.png', data: PNG });
    fs.mkdirSync(path.join(wiki.dir, 'Otro.assets'));

    const result = updateNote(wiki, 'Viejo', { title: 'Otro', content: '' });

    expect(result).toEqual({ ok: false, error: 'duplicate' });
    expect(names('.')).toEqual(['Otro.assets', 'Viejo.assets', 'Viejo.md']);
    expect(getNote(wiki, 'Viejo').ok).toBe(true);
  });

  it('CP-08-128: deleting a note can delete its attachments too, or keep them', () => {
    make('A');
    make('B');
    attachFile(wiki, { slug: 'A', name: 'a.png', data: PNG });
    attachFile(wiki, { slug: 'B', name: 'b.png', data: PNG });

    const a = getNote(wiki, 'A');
    expect(a.ok && a.note.attachments).toBe(1);

    expect(deleteNote(wiki, 'A', true)).toBe(true);
    expect(deleteNote(wiki, 'B', false)).toBe(true);

    expect(names('.')).toEqual(['B.assets']);
    expect(names('B.assets')).toEqual(['b.png']);
  });

  it('CP-08-128: attachments kept after a delete are found again by a note with that name', () => {
    make('B');
    attachFile(wiki, { slug: 'B', name: 'b.png', data: PNG });
    deleteNote(wiki, 'B', false);
    make('B');

    const again = getNote(wiki, 'B');
    expect(again.ok && again.note.attachments).toBe(1);
  });

  it('CP-08-129: a note without attachments reports none, so nothing is asked', () => {
    make('A');
    const result = getNote(wiki, 'A');
    expect(result.ok && result.note.attachments).toBeUndefined();
    expect(deleteNote(wiki, 'A')).toBe(true);
    expect(deleteNote(wiki, 'A', 'yes')).toBe(false);
  });

  it('CP-08-128: an assets folder is not mistaken for a section when the index is rebuilt', () => {
    make('A');
    attachFile(wiki, { slug: 'A', name: 'a.md', data: new Uint8Array([35, 32, 120]) });

    expect(rebuildIndex(wiki)).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM note_sections').get()).toEqual({ n: 0 });
    expect(createSection(wiki, { title: 'x.assets' })).toEqual({ ok: false, error: 'invalid' });
  });

  it('CP-08-130: the export includes the *.assets folders next to their notes', () => {
    expect(createSection(wiki, { title: 'Guías' }).ok).toBe(true);
    make('Raíz');
    make('inst', 'Guías');
    attachFile(wiki, { slug: 'Raíz', name: 'r.png', data: PNG });
    attachFile(wiki, { slug: 'Guías/inst', name: 'c.png', data: new Uint8Array([9, 9]) });

    const entries = readZip(buildExport(db, wiki.dir)).map((e) => e.name);

    expect(entries).toContain('wiki/Raíz.md');
    expect(entries).toContain('wiki/Raíz.assets/r.png');
    expect(entries).toContain('wiki/Guías/inst.md');
    expect(entries).toContain('wiki/Guías/inst.assets/c.png');
    expect(entries.filter((n) => n.includes('.assets')).length).toBe(2);
  });
});
