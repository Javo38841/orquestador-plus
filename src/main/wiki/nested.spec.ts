import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../shared/ipc';
import { openDatabase } from '../db/database';
import { buildExport } from '../export/export';
import { readZip } from '../export/zip';
import { registerIpcHandlers } from '../ipc/register';
import { attachFile } from './attachments';
import {
  createNote,
  createSection,
  deleteNote,
  getNote,
  listNotes,
  listSections,
  rebuildIndex,
  rebuildIndexReport,
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
}));

describe('nested wiki folders (#89)', () => {
  let root: string;
  let db: Database.Database;
  let wiki: Wiki;

  const write = (rel: string, title: string, extra = '', body = 'texto') => {
    const file = path.join(wiki.dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---\ntitle: "${title}"\n${extra}---\n\n${body}`);
  };
  const files = () => fs.readdirSync(wiki.dir, { recursive: true }).map(String).sort();
  const section = (title: string, parent?: string) => {
    const result = createSection(wiki, { title, ...(parent !== undefined && { parent }) });
    if (!result.ok) throw new Error(result.error);
    return result.section.name;
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-nested-'));
    db = openDatabase(root);
    wiki = { db, dir: path.join(root, 'wiki') };
    handlers.clear();
  });
  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('CP-08-75: a note in nested folders is indexed with its full folder path and opens', () => {
    write('Proyectos/OrquestadorPlus/Decisiones/adr-001.md', 'ADR-001', '', 'Decisión.');
    rebuildIndex(wiki);

    expect(listNotes(wiki)).toMatchObject([
      {
        slug: 'Proyectos/OrquestadorPlus/Decisiones/adr-001',
        section: 'Proyectos/OrquestadorPlus/Decisiones',
      },
    ]);
    const opened = getNote(wiki, 'Proyectos/OrquestadorPlus/Decisiones/adr-001');
    expect(opened.ok && opened.note).toMatchObject({
      title: 'ADR-001',
      content: 'Decisión.',
      section: 'Proyectos/OrquestadorPlus/Decisiones',
    });
    expect(listNotes(wiki, 'Proyectos/OrquestadorPlus/Decisiones')).toHaveLength(1);
    expect(listNotes(wiki, 'Proyectos')).toEqual([]);
  });

  it('CP-08-76: _section.md gives title and order to a folder at any level', () => {
    write('A/_section.md', 'Área', 'order: 2\n', '');
    write('A/B/_section.md', 'Sub', 'order: 7\n', '');
    write('A/B/n.md', 'N');
    write('A/C/n.md', 'M');
    rebuildIndex(wiki);

    expect(listSections(wiki)).toEqual([
      { name: 'A', title: 'Área', order: 2 },
      { name: 'A/B', title: 'Sub', order: 7 },
      { name: 'A/C', title: 'C' },
    ]);
  });

  it('CP-08-77: a folder with only subfolders with notes, or an empty one with _section.md, is listed', () => {
    write('Solo/Hijas/Nietas/n.md', 'N');
    write('Vacia/_section.md', 'Vacía', '', '');
    fs.mkdirSync(path.join(wiki.dir, 'Nada/Tampoco'), { recursive: true });
    rebuildIndex(wiki);

    expect(listSections(wiki).map((s) => s.name)).toEqual([
      'Solo',
      'Solo/Hijas',
      'Solo/Hijas/Nietas',
      'Vacia',
    ]);
  });

  it('CP-08-81: a section is created inside another with its _section.md', () => {
    const a = section('Proyectos');
    const b = section('OrquestadorPlus', a);

    expect(b).toBe('Proyectos/OrquestadorPlus');
    expect(files()).toEqual([
      'Proyectos',
      'Proyectos/OrquestadorPlus',
      'Proyectos/OrquestadorPlus/_section.md',
      'Proyectos/_section.md',
    ]);
    expect(listSections(wiki)).toEqual([
      { name: 'Proyectos', title: 'Proyectos' },
      { name: 'Proyectos/OrquestadorPlus', title: 'OrquestadorPlus' },
    ]);
    rebuildIndex(wiki);
    expect(listSections(wiki)).toHaveLength(2);
  });

  it('CP-08-82: a page is created in a nested folder, opens and is listed under it', () => {
    const b = section('B', section('A'));
    const created = createNote(wiki, { title: 'ADR-001', content: 'x', section: b });

    expect(created).toMatchObject({ ok: true, note: { slug: 'A/B/ADR-001', section: 'A/B' } });
    expect(fs.existsSync(path.join(wiki.dir, 'A', 'B', 'ADR-001.md'))).toBe(true);
    expect(listNotes(wiki, 'A/B').map((n) => n.slug)).toEqual(['A/B/ADR-001']);
    expect(getNote(wiki, 'A/B/ADR-001').ok).toBe(true);
  });

  it('CP-08-83: empty, unsafe or repeated names create nothing; the same name elsewhere is fine', () => {
    const a = section('A');
    section('B');
    createNote(wiki, { title: 'Nota', content: '', section: a });
    const before = files();

    for (const title of ['', '  ', 'x/y', 'x\\y', '..', '../fuera']) {
      expect(createSection(wiki, { title, parent: a }), title).toMatchObject({ ok: false });
    }
    expect(createSection(wiki, { title: 'a', parent: undefined })).toEqual({
      ok: false,
      error: 'duplicate',
    });
    section('Sub', a);
    expect(createSection(wiki, { title: 'sub', parent: a })).toEqual({
      ok: false,
      error: 'duplicate',
    });
    expect(createNote(wiki, { title: 'Nota', content: '', section: a })).toEqual({
      ok: false,
      error: 'duplicate',
    });
    expect(files().filter((f) => !f.includes('Sub'))).toEqual(before);
    // same names in other folders are valid
    expect(section('Sub', 'B')).toBe('B/Sub');
    expect(createNote(wiki, { title: 'Nota', content: '', section: 'B' })).toMatchObject({
      ok: true,
    });
    expect(createNote(wiki, { title: 'Nota', content: '' })).toMatchObject({ ok: true });
    expect(
      listNotes(wiki)
        .map((n) => n.slug)
        .sort(),
    ).toEqual(['A/Nota', 'B/Nota', 'Nota']);
    expect(fs.existsSync(path.join(root, 'fuera'))).toBe(false);
  });

  it('CP-08-83: the same title in two folders survives a rebuild', () => {
    write('A/n.md', 'Igual');
    write('B/n.md', 'Igual');
    write('Igual.md', 'Igual');
    const report = rebuildIndexReport(wiki);

    expect(report).toEqual({ count: 3, skipped: [] });
  });

  it('CP-08-83: a duplicate title in the same folder is skipped by the rebuild', () => {
    write('A/uno.md', 'Igual');
    write('A/dos.md', 'igual');
    expect(rebuildIndexReport(wiki).skipped).toEqual([{ file: 'A/uno.md', reason: 'duplicate' }]);
  });

  it('CP-08-85: [[links]] and backlinks point at the right note when two folders share a title', () => {
    write('A/Dup.md', 'Dup', '', 'soy A');
    write('B/Dup.md', 'Dup', '', 'soy B');
    write('B/Usa.md', 'Usa', '', '[[Dup]] y [[B/Dup]] y [[A/Dup]]');
    write('C/Otra.md', 'Otra', '', '[[Dup]]');
    rebuildIndex(wiki);

    const usa = getNote(wiki, 'B/Usa');
    expect(usa.ok && usa.note.links).toEqual([
      { label: 'Dup', key: 'dup', slug: 'A/Dup' },
      { label: 'B/Dup', key: 'b/dup', slug: 'B/Dup' },
      { label: 'A/Dup', key: 'a/dup', slug: 'A/Dup' },
    ]);
    const a = getNote(wiki, 'A/Dup');
    const b = getNote(wiki, 'B/Dup');
    expect(a.ok && a.note.backlinks.map((n) => n.slug)).toEqual(['C/Otra', 'B/Usa']);
    expect(b.ok && b.note.backlinks.map((n) => n.slug)).toEqual(['B/Usa']);
  });

  it('CP-08-85: a title in the root wins over the same title in a folder', () => {
    write('A/Dup.md', 'Dup');
    write('Dup.md', 'Dup');
    write('Usa.md', 'Usa', '', '[[Dup]]');
    rebuildIndex(wiki);
    const usa = getNote(wiki, 'Usa');
    expect(usa.ok && usa.note.links[0].slug).toBe('Dup');
  });

  it('CP-08-86: symbolic links at any depth that leave wiki/ are ignored, never read', () => {
    const outside = path.join(root, 'fuera');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 's.md'), '---\ntitle: "Secreto"\n---\n\nno');
    write('A/B/ok.md', 'Ok');
    fs.symlinkSync(outside, path.join(wiki.dir, 'A', 'B', 'Enlace'), 'dir');
    fs.symlinkSync(path.join(outside, 's.md'), path.join(wiki.dir, 'A', 'B', 'sym.md'));
    rebuildIndex(wiki);

    expect(listNotes(wiki).map((n) => n.slug)).toEqual(['A/B/ok']);

    // a folder swapped for a symlink after indexing is never read, written or created in
    fs.rmSync(path.join(wiki.dir, 'A', 'B'), { recursive: true });
    fs.symlinkSync(outside, path.join(wiki.dir, 'A', 'B'), 'dir');
    expect(getNote(wiki, 'A/B/ok')).toEqual({ ok: false, error: 'not_found' });
    expect(createNote(wiki, { title: 'Nueva', content: '', section: 'A/B' })).toMatchObject({
      ok: false,
    });
    expect(createSection(wiki, { title: 'X', parent: 'A/B' })).toMatchObject({ ok: false });
    expect(fs.readdirSync(outside)).toEqual(['s.md']);
  });

  it('CP-08-86: paths with .., absolute or with backslashes are rejected', () => {
    write('A/ok.md', 'Ok');
    rebuildIndex(wiki);
    for (const slug of ['../x', 'A/../A/ok', '/A/ok', 'A//ok', 'A\\ok', 'C:\\x']) {
      expect(getNote(wiki, slug), slug).toEqual({ ok: false, error: 'invalid' });
      expect(deleteNote(wiki, slug), slug).toBe(false);
    }
    expect(
      attachFile(wiki, { slug: 'A/../A/ok', name: 'a.png', data: new Uint8Array([1]) }),
    ).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('CP-08-87: folders deeper than the limit are reported with their path, not lost silently', () => {
    write('a/b/c/d/e/ok.md', 'Ok');
    write('a/b/c/d/e/f/g/hondo.md', 'Hondo');
    const report = rebuildIndexReport(wiki);

    expect(report.count).toBe(1);
    expect(report.skipped).toEqual([{ file: 'a/b/c/d/e/f', reason: 'too_deep' }]);
  });

  it('CP-08-87: creating a folder or page beyond the limit is rejected', () => {
    let parent = section('a');
    for (const name of ['b', 'c', 'd', 'e']) parent = section(name, parent);
    expect(parent).toBe('a/b/c/d/e');
    const before = files();

    expect(createSection(wiki, { title: 'f', parent })).toEqual({ ok: false, error: 'too_deep' });
    expect(createNote(wiki, { title: 'n', content: '', section: `${parent}/f` })).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(createNote(wiki, { title: 'n', content: '', section: parent }).ok).toBe(true);
    expect(files().filter((f) => !f.endsWith('/n.md'))).toEqual(before);
  });

  it('CP-08-88: IPC payloads that are invalid are rejected without touching the disk', () => {
    registerIpcHandlers(db, wiki.dir);
    const makeSection = handlers.get(IpcChannel.createSection)!;
    const makeNote = handlers.get(IpcChannel.createNote)!;
    const read = handlers.get(IpcChannel.getNote)!;

    for (const parent of ['..', '../x', '/etc', 'a//b', 'a/b/c/d/e/f', 7, null, '', 'a\\b']) {
      expect(makeSection({}, { title: 'X', parent }), String(parent)).toMatchObject({ ok: false });
    }
    for (const section of ['..', 'a/../b', '/etc', 'a/b/c/d/e/f', 7, '', 'a\\b']) {
      expect(makeNote({}, { title: 'X', content: '', section })).toEqual({
        ok: false,
        error: 'invalid',
      });
    }
    for (const slug of ['../x', 'a/b/c/d/e/f/n', 7, null, 'a/../n']) {
      expect(read({}, slug), String(slug)).toEqual({ ok: false, error: 'invalid' });
    }
    expect(fs.existsSync(wiki.dir)).toBe(false);
    expect(fs.existsSync(path.join(root, 'x'))).toBe(false);
  });

  it('CP-08-88: a failed _section.md write leaves no half-made nested folder', () => {
    const a = section('A');
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('disk full');
    });
    try {
      expect(createSection(wiki, { title: 'B', parent: a })).toEqual({ ok: false, error: 'io' });
    } finally {
      spy.mockRestore();
    }
    expect(files()).toEqual(['A', 'A/_section.md']);
    expect(listSections(wiki)).toEqual([{ name: 'A', title: 'A' }]);
    expect(createSection(wiki, { title: 'B', parent: a })).toMatchObject({ ok: true });
  });

  it('CP-08-88: a parent that is not a folder of the wiki creates nothing', () => {
    expect(createSection(wiki, { title: 'B', parent: 'NoExiste' })).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(fs.existsSync(wiki.dir)).toBe(false);
    expect(listSections(wiki)).toEqual([]);
  });

  it('CP-08-89: a wiki with one level of sections keeps working as before', () => {
    write('raiz.md', 'Raíz', '', '[[Uno]]');
    write('Guías/uno.md', 'Uno', 'order: 1\n');
    write('Guías/_section.md', 'Guías prácticas', 'order: 3\n', '');
    rebuildIndex(wiki);

    expect(listSections(wiki)).toEqual([{ name: 'Guías', title: 'Guías prácticas', order: 3 }]);
    const raiz = getNote(wiki, 'raiz');
    expect(raiz.ok && raiz.note.links).toEqual([{ label: 'Uno', key: 'uno', slug: 'Guías/uno' }]);
    const uno = getNote(wiki, 'Guías/uno');
    expect(uno.ok && uno.note.backlinks.map((n) => n.slug)).toEqual(['raiz']);
    expect(uno.ok && uno.note.order).toBe(1);
  });

  it('CP-08-89: the migration lets two folders hold the same title but not the same file', () => {
    createNote(wiki, { title: 'Igual', content: '', section: section('A') });
    expect(createNote(wiki, { title: 'Igual', content: '', section: section('B') }).ok).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS n FROM notes').get()).toEqual({ n: 2 });
  });

  it('CP-08-82: renaming and deleting inside a nested folder keep the note in its folder', () => {
    const b = section('B', section('A'));
    createNote(wiki, { title: 'Uno', content: 'x', section: b });
    const renamed = updateNote(wiki, 'A/B/Uno', { title: 'Dos', content: 'y' });

    expect(renamed).toMatchObject({ ok: true, note: { slug: 'A/B/Dos', section: 'A/B' } });
    expect(files()).toContain('A/B/Dos.md');
    expect(files()).not.toContain('A/B/Uno.md');
    expect(deleteNote(wiki, 'A/B/Dos')).toBe(true);
    // _section.md keeps the folders
    expect(listSections(wiki).map((s) => s.name)).toEqual(['A', 'A/B']);
  });

  it('CP-08-82: attachments of a nested note live next to it and the link is relative to it', () => {
    const b = section('B', section('A'));
    createNote(wiki, { title: 'Uno', content: '', section: b });
    const result = attachFile(wiki, {
      slug: 'A/B/Uno',
      name: 'c.png',
      data: new Uint8Array([1, 2]),
    });

    expect(result).toMatchObject({ ok: true, link: expect.stringContaining('(Uno.assets/c.png)') });
    expect(fs.existsSync(path.join(wiki.dir, 'A', 'B', 'Uno.assets', 'c.png'))).toBe(true);
    const names = readZip(buildExport(db, wiki.dir)).map((e) => e.name);
    expect(names).toContain('wiki/A/B/Uno.md');
    expect(names).toContain('wiki/A/B/Uno.assets/c.png');
  });
});
