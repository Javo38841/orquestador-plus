import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../shared/ipc';
import { openDatabase } from '../db/database';
import { registerIpcHandlers } from '../ipc/register';
import { buildExport } from '../export/export';
import { readZip } from '../export/zip';
import {
  createNote,
  createSection,
  deleteNote,
  getNote,
  listNotes,
  listSections,
  parseNote,
  rebuildIndex,
  serializeNote,
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

describe('wiki sections', () => {
  let root: string;
  let db: Database.Database;
  let wiki: Wiki;

  const write = (rel: string, title: string, extra = '', body = 'texto') => {
    const file = path.join(wiki.dir, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `---\ntitle: "${title}"\n${extra}---\n\n${body}`);
  };
  const tree = () => fs.readdirSync(wiki.dir, { recursive: true }).map(String).sort();

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-sections-'));
    db = openDatabase(root);
    wiki = { db, dir: path.join(root, 'wiki') };
    handlers.clear();
  });

  afterEach(() => {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('CP-08-20: each listed note carries its section; notes in the root have none', () => {
    write('raiz.md', 'Raíz');
    write('Guías/uno.md', 'Uno');
    write('Guías/dos.md', 'Dos');
    write('Empezar/inicio.md', 'Inicio');
    rebuildIndex(wiki);

    const sectionOf = Object.fromEntries(listNotes(wiki).map((n) => [n.slug, n.section]));
    expect(sectionOf).toEqual({
      raiz: undefined,
      uno: 'Guías',
      dos: 'Guías',
      inicio: 'Empezar',
    });
    expect(listNotes(wiki, 'Guías').map((n) => n.slug)).toEqual(['dos', 'uno']);
    expect(listSections(wiki).map((s) => s.name)).toEqual(['Empezar', 'Guías']);
  });

  it('CP-08-21: order and description come from the frontmatter, _section.md from the folder', () => {
    write('Guías/_section.md', 'Guías prácticas', 'order: 3\n', '');
    write('Guías/b.md', 'B', 'order: 2\ndescription: "Cómo hacerlo"\n');
    write('Guías/a.md', 'A');
    write('Empezar/x.md', 'X');
    rebuildIndex(wiki);

    expect(listSections(wiki)).toEqual([
      { name: 'Empezar', title: 'Empezar' },
      { name: 'Guías', title: 'Guías prácticas', order: 3 },
    ]);
    expect(listNotes(wiki, 'Guías').find((n) => n.slug === 'b')).toMatchObject({
      order: 2,
      description: 'Cómo hacerlo',
    });
    expect(listNotes(wiki).some((n) => n.slug === '_section')).toBe(false);
    expect(parseNote(serializeNote('T', 'c', 'u', 'x', { order: 4 })).order).toBe(4);
  });

  it('CP-08-22: empty folders, unsafe names, nested folders and escaping symlinks are ignored', () => {
    fs.mkdirSync(path.join(wiki.dir, 'Vacía'), { recursive: true });
    write('Guías/ok.md', 'Ok');
    write('Guías/Sub/profunda.md', 'Profunda');
    write('.oculta/x.md', 'Oculta');
    const outside = path.join(root, 'fuera');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secreto.md'), '---\ntitle: "Secreto"\n---\n\nno');
    fs.symlinkSync(outside, path.join(wiki.dir, 'Enlace'), 'dir');
    fs.symlinkSync(path.join(outside, 'secreto.md'), path.join(wiki.dir, 'Guías', 'sym.md'));
    fs.symlinkSync(path.join(outside, 'secreto.md'), path.join(wiki.dir, 'raiz-sym.md'));
    rebuildIndex(wiki);

    expect(listNotes(wiki).map((n) => n.slug)).toEqual(['ok']);
    expect(listSections(wiki).map((s) => s.name)).toEqual(['Guías']);
    expect(listNotes(wiki, '..')).toEqual([]);
    expect(listNotes(wiki, 'a\\b')).toEqual([]);
  });

  it('CP-08-22: a section folder swapped for a symlink after indexing is never read', () => {
    write('Guías/ok.md', 'Ok');
    rebuildIndex(wiki);
    const outside = path.join(root, 'fuera');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'ok.md'), '---\ntitle: "Ok"\n---\n\nsecreto');
    fs.rmSync(path.join(wiki.dir, 'Guías'), { recursive: true });
    fs.symlinkSync(outside, path.join(wiki.dir, 'Guías'), 'dir');

    expect(getNote(wiki, 'ok')).toEqual({ ok: false, error: 'not_found' });
  });

  it('CP-08-23: create, edit and delete work inside the section folder and links still resolve', () => {
    expect(createNote(wiki, { title: 'Alfa', content: 'ver [[Beta]]', section: 'Guías' }).ok).toBe(
      true,
    );
    expect(createNote(wiki, { title: 'Beta', content: '' }).ok).toBe(true);
    expect(tree()).toEqual(['Beta.md', 'Guías', 'Guías/Alfa.md']);

    const alfa = getNote(wiki, 'Alfa');
    expect(alfa.ok && alfa.note.section).toBe('Guías');
    expect(alfa.ok && alfa.note.links).toEqual([{ label: 'Beta', key: 'beta', slug: 'Beta' }]);

    const edited = updateNote(wiki, 'Alfa', { title: 'Alfa 2', content: 'nuevo' });
    expect(edited.ok && edited.note.section).toBe('Guías');
    expect(tree()).toEqual(['Beta.md', 'Guías', 'Guías/Alfa 2.md']);
    const beta = getNote(wiki, 'Beta');
    expect(beta.ok && beta.note.backlinks).toEqual([]);

    expect(deleteNote(wiki, 'Alfa 2')).toBe(true);
    expect(tree()).toEqual(['Beta.md', 'Guías']);
  });

  it('CP-08-23: editing keeps order and description; _section is not a valid note name', () => {
    write('Guías/b.md', 'B', 'order: 2\ndescription: "Resumen"\n');
    rebuildIndex(wiki);
    updateNote(wiki, 'b', { title: 'B', content: 'cambiado' });
    const saved = parseNote(fs.readFileSync(path.join(wiki.dir, 'Guías', 'b.md'), 'utf8'));
    expect(saved).toMatchObject({ order: 2, description: 'Resumen', content: 'cambiado' });

    expect(createNote(wiki, { title: '_section', content: '', section: 'Guías' })).toEqual({
      ok: false,
      error: 'duplicate',
    });
  });

  it('CP-08-24: with datos.db deleted the index is rebuilt with the sections from the folders', () => {
    createNote(wiki, { title: 'Alfa', content: '', section: 'Guías' });
    write('Guías/_section.md', 'Guías prácticas', 'order: 1\n', '');
    db.close();
    fs.rmSync(path.join(root, 'datos.db'));
    fs.rmSync(path.join(root, 'datos.db-wal'), { force: true });
    fs.rmSync(path.join(root, 'datos.db-shm'), { force: true });
    db = openDatabase(root);
    wiki = { db, dir: wiki.dir };

    expect(rebuildIndex(wiki)).toBe(1);
    expect(listNotes(wiki)[0]).toMatchObject({ slug: 'Alfa', section: 'Guías' });
    expect(listSections(wiki)).toEqual([{ name: 'Guías', title: 'Guías prácticas', order: 1 }]);
  });

  describe('creating sections', () => {
    it('CP-08-67: creates the folder with its _section.md and lists it while it has no pages', () => {
      const now = new Date('2026-10-22T10:00:00.000Z');
      expect(createSection(wiki, { title: ' Guías ' }, now)).toEqual({
        ok: true,
        section: { name: 'Guías', title: 'Guías' },
      });

      const file = path.join(wiki.dir, 'Guías', '_section.md');
      expect(parseNote(fs.readFileSync(file, 'utf8')).title).toBe('Guías');
      expect(listSections(wiki)).toEqual([{ name: 'Guías', title: 'Guías' }]);
      expect(listNotes(wiki)).toEqual([]);

      // Restart: datos.db rebuilt from the folders keeps the empty section.
      rebuildIndex(wiki);
      expect(listSections(wiki)).toEqual([{ name: 'Guías', title: 'Guías' }]);
    });

    it('CP-08-67: a page created in the new section is listed under it, once', () => {
      createSection(wiki, { title: 'Guías' });
      expect(
        createNote(wiki, { title: 'Instalación', content: '', section: 'Guías' }),
      ).toMatchObject({ ok: true, note: { section: 'Guías' } });
      expect(listSections(wiki)).toEqual([{ name: 'Guías', title: 'Guías' }]);
      expect(tree()).toEqual(['Guías', 'Guías/Instalación.md', 'Guías/_section.md']);
    });

    it('CP-08-68: empty, unsafe or repeated names create nothing', () => {
      write('Decisiones/adr.md', 'ADR');
      fs.mkdirSync(path.join(wiki.dir, 'Suelta'));
      rebuildIndex(wiki);
      createSection(wiki, { title: 'Guías' });
      const before = tree();

      for (const title of ['', '   ', 'a/b', '..', '../fuera', 'a\\b']) {
        expect(createSection(wiki, { title }), title).toMatchObject({ ok: false });
      }
      for (const title of ['Guías', 'guías', 'DECISIONES', 'Suelta']) {
        expect(createSection(wiki, { title }), title).toEqual({ ok: false, error: 'duplicate' });
      }
      expect(tree()).toEqual(before);
      expect(fs.existsSync(path.join(root, 'fuera'))).toBe(false);
    });

    it('CP-08-69: if writing _section.md fails, no half-made folder is left', () => {
      const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('disk full');
      });
      try {
        expect(createSection(wiki, { title: 'Guías' })).toEqual({ ok: false, error: 'io' });
      } finally {
        spy.mockRestore();
      }
      expect(fs.existsSync(path.join(wiki.dir, 'Guías'))).toBe(false);
      expect(listSections(wiki)).toEqual([]);
      expect(createSection(wiki, { title: 'Guías' })).toMatchObject({ ok: true });
    });

    it('deleting the last page keeps a section with _section.md and drops one without it', () => {
      createSection(wiki, { title: 'Guías' });
      createNote(wiki, { title: 'A', content: '', section: 'Guías' });
      createNote(wiki, { title: 'B', content: '', section: 'Sueltas' });
      rebuildIndex(wiki);
      deleteNote(wiki, 'A');
      deleteNote(wiki, 'B');
      expect(listSections(wiki).map((s) => s.name)).toEqual(['Guías']);
    });
  });

  describe('IPC channels', () => {
    it('CP-08-25: an invalid section is rejected without touching the disk', () => {
      registerIpcHandlers(db, wiki.dir);
      const create = handlers.get(IpcChannel.createNote)!;
      const list = handlers.get(IpcChannel.listNotes)!;

      for (const section of ['..', '../x', 'a/b', 'a\\b', '/etc', 'C:\\x', 7, null, '', '.git']) {
        expect(create({}, { title: 'X', content: '', section })).toEqual({
          ok: false,
          error: 'invalid',
        });
      }
      for (const section of ['..', '/etc', 7, null]) expect(list({}, section)).toEqual([]);
      expect(fs.existsSync(wiki.dir)).toBe(false);
      expect(fs.existsSync(path.join(root, 'x'))).toBe(false);

      expect(create({}, { title: 'Ok', content: '', section: 'Guías' })).toMatchObject({
        ok: true,
      });
      expect(list({}, 'Guías')).toHaveLength(1);
      expect(list({})).toHaveLength(1);
    });
  });

  it('CP-08-69: the IPC channel rejects invalid payloads without touching the disk', () => {
    registerIpcHandlers(db, wiki.dir);
    const create = handlers.get(IpcChannel.createSection)!;

    for (const payload of [undefined, null, 'Guías', 7, {}, { title: 7 }, { title: '../x' }]) {
      expect(create({}, payload)).toMatchObject({ ok: false });
    }
    expect(fs.existsSync(wiki.dir)).toBe(false);
    expect(fs.existsSync(path.join(root, 'x'))).toBe(false);

    expect(create({}, { title: 'Guías' })).toMatchObject({ ok: true });
    expect(handlers.get(IpcChannel.listSections)!({})).toEqual([{ name: 'Guías', title: 'Guías' }]);
  });

  it('CP-08-23: the export keeps the section folders', () => {
    createNote(wiki, { title: 'Alfa', content: '', section: 'Guías' });
    createNote(wiki, { title: 'Beta', content: '' });
    const names = readZip(buildExport(db, wiki.dir)).map((e) => e.name);
    expect(names).toContain('wiki/Guías/Alfa.md');
    expect(names).toContain('wiki/Beta.md');
  });
});
