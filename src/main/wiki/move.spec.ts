import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannel } from '../../shared/ipc';
import { openDatabase } from '../db/database';
import { registerIpcHandlers } from '../ipc/register';
import { createWikiSync } from './watcher';
import {
  createNote,
  createSection,
  getNote,
  listNotes,
  listSections,
  moveNote,
  rebuildIndex,
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

describe('moving wiki pages (#99)', () => {
  let root: string;
  let db: Database.Database;
  let wiki: Wiki;

  const at = (...parts: string[]): string => path.join(wiki.dir, ...parts);
  const tree = (): string[] => fs.readdirSync(wiki.dir, { recursive: true }).map(String).sort();
  const section = (title: string, parent?: string): string => {
    const result = createSection(wiki, { title, ...(parent !== undefined && { parent }) });
    if (!result.ok) throw new Error(result.error);
    return result.section.name;
  };
  const note = (title: string, sectionName?: string, content = ''): void => {
    const result = createNote(wiki, {
      title,
      content,
      ...(sectionName !== undefined && { section: sectionName }),
    });
    if (!result.ok) throw new Error(result.error);
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-move-'));
    db = openDatabase(root);
    wiki = { db, dir: path.join(root, 'wiki') };
    handlers.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('CP-08-133: the file ends up in the target section and is gone from the old path', () => {
    section('Guías');
    section('Manuales');
    section('Linux', 'Manuales');
    note('instalacion', 'Guías');
    const result = moveNote(wiki, 'Guías/instalacion', 'Manuales/Linux');
    expect(result).toMatchObject({
      ok: true,
      note: { slug: 'Manuales/Linux/instalacion', section: 'Manuales/Linux' },
    });
    expect(fs.existsSync(at('Manuales', 'Linux', 'instalacion.md'))).toBe(true);
    expect(fs.existsSync(at('Guías', 'instalacion.md'))).toBe(false);
    expect(listNotes(wiki).map((n) => n.slug)).toEqual(['Manuales/Linux/instalacion']);
  });

  it('CP-08-134: the assets folder moves with the note and its links keep resolving', () => {
    section('Guías');
    section('Manuales');
    note('instalacion', 'Guías', '![a](instalacion.assets/a.png)');
    fs.mkdirSync(at('Guías', 'instalacion.assets'));
    fs.writeFileSync(at('Guías', 'instalacion.assets', 'a.png'), 'png');
    const result = moveNote(wiki, 'Guías/instalacion', 'Manuales');
    expect(result).toMatchObject({ ok: true, note: { attachments: 1 } });
    expect(fs.existsSync(at('Guías', 'instalacion.assets'))).toBe(false);
    expect(fs.readFileSync(at('Manuales', 'instalacion.assets', 'a.png'), 'utf8')).toBe('png');
    const moved = getNote(wiki, 'Manuales/instalacion');
    expect(moved).toMatchObject({ ok: true, note: { content: '![a](instalacion.assets/a.png)' } });
  });

  it('CP-08-135: frontmatter and body are byte for byte the same', () => {
    section('A');
    section('B');
    const raw =
      '\uFEFF---\r\ntitle: "Nota"\r\n# comentario\r\nextra: 1\r\norder: 3\r\n---\r\n\r\nCuerpo\r\ncon CRLF  \r\n';
    fs.writeFileSync(at('A', 'nota.md'), raw);
    rebuildIndex(wiki);
    expect(moveNote(wiki, 'A/nota', 'B')).toMatchObject({ ok: true, note: { order: 3 } });
    expect(fs.readFileSync(at('B', 'nota.md'), 'utf8')).toBe(raw);
  });

  it('CP-08-136: outgoing links and backlinks still resolve after the move', () => {
    section('A');
    section('B');
    note('Destino', 'A', 'ver [[Origen]]');
    note('Origen', undefined, 'va a [[Destino]]');
    moveNote(wiki, 'A/Destino', 'B');
    const moved = getNote(wiki, 'B/Destino');
    expect(moved).toMatchObject({
      ok: true,
      note: {
        links: [{ label: 'Origen', slug: 'Origen' }],
        backlinks: [{ slug: 'Origen' }],
      },
    });
    expect(getNote(wiki, 'Origen')).toMatchObject({
      ok: true,
      note: { links: [{ label: 'Destino', slug: 'B/Destino' }] },
    });
  });

  it('CP-08-137: the root as target leaves a loose page in wiki/', () => {
    section('Guías');
    note('suelta', 'Guías');
    expect(moveNote(wiki, 'Guías/suelta', null)).toMatchObject({
      ok: true,
      note: { slug: 'suelta' },
    });
    expect(fs.existsSync(at('suelta.md'))).toBe(true);
    expect(listNotes(wiki)[0].section).toBeUndefined();
  });

  it('CP-08-138: a name already taken in the target moves nothing and says so', () => {
    section('A');
    section('B');
    note('igual', 'A');
    note('igual', 'B');
    fs.mkdirSync(at('A', 'igual.assets'));
    fs.writeFileSync(at('A', 'igual.assets', 'x.txt'), 'x');
    const before = tree();
    expect(moveNote(wiki, 'A/igual', 'B')).toEqual({ ok: false, error: 'duplicate' });
    expect(tree()).toEqual(before);
    expect(listNotes(wiki).map((n) => n.slug)).toEqual(['A/igual', 'B/igual']);
  });

  it('CP-08-138: a leftover assets folder in the target also stops the move', () => {
    section('A');
    section('B');
    note('n', 'A');
    fs.mkdirSync(at('B', 'n.assets'));
    expect(moveNote(wiki, 'A/n', 'B')).toEqual({ ok: false, error: 'duplicate' });
    expect(fs.existsSync(at('A', 'n.md'))).toBe(true);
  });

  it('CP-08-139: moving to the section where the note already is does nothing, without error', () => {
    section('A');
    note('n', 'A');
    const before = tree();
    expect(moveNote(wiki, 'A/n', 'A')).toMatchObject({ ok: true, note: { slug: 'A/n' } });
    note('suelta');
    expect(moveNote(wiki, 'suelta', null)).toMatchObject({ ok: true, note: { slug: 'suelta' } });
    expect(tree().filter((f) => f !== 'suelta.md')).toEqual(before);
  });

  it('CP-08-140: a failure halfway leaves the note and its assets where they were', () => {
    section('A');
    section('B');
    note('n', 'A', 'hola');
    fs.mkdirSync(at('A', 'n.assets'));
    fs.writeFileSync(at('A', 'n.assets', 'f.txt'), 'f');
    const rename = fs.renameSync.bind(fs);
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (String(from).endsWith('.assets')) throw new Error('disk error');
      rename(from, to);
    });
    expect(moveNote(wiki, 'A/n', 'B')).toEqual({ ok: false, error: 'io' });
    expect(fs.existsSync(at('A', 'n.md'))).toBe(true);
    expect(fs.existsSync(at('A', 'n.assets', 'f.txt'))).toBe(true);
    expect(fs.existsSync(at('B', 'n.md'))).toBe(false);
    expect(listNotes(wiki).map((n) => n.slug)).toEqual(['A/n']);
    expect(getNote(wiki, 'A/n')).toMatchObject({ ok: true });
  });

  it('CP-08-141: invalid payloads are rejected over IPC without moving anything', () => {
    section('A');
    note('n', 'A');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-out-'));
    try {
      fs.symlinkSync(outside, at('enlace'), 'dir');
      fs.writeFileSync(path.join(outside, 'real.md'), 'x');
      fs.symlinkSync(path.join(outside, 'real.md'), at('A', 'link.md'));
      registerIpcHandlers(db, wiki.dir);
      const move = handlers.get(IpcChannel.moveNote)!;
      const before = tree();
      for (const [slug, target] of [
        ['A/nada', null],
        ['A/n', 'NoExiste'],
        ['A/n', '..'],
        ['A/n', '../fuera'],
        ['A/n', 'A/../..'],
        ['A/n', '/etc'],
        ['A/n', 'enlace'],
        ['../n', null],
        ['A/n', 7],
        ['A/n', undefined],
        [42, null],
        ['A/link', null],
      ] as [unknown, unknown][]) {
        expect(move({}, slug, target), `${String(slug)} -> ${String(target)}`).toMatchObject({
          ok: false,
        });
      }
      expect(tree()).toEqual(before);
      expect(fs.existsSync(path.join(outside, 'n.md'))).toBe(false);
      expect(fs.existsSync(path.join(outside, 'real.md'))).toBe(true);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('CP-08-142: a move made by the app is not reported as an outside change', async () => {
    section('A');
    section('B');
    note('n', 'A', 'x');
    const onChange = vi.fn();
    const sync = createWikiSync(wiki, { onChange, debounceMs: 40, maxWaitMs: 1000 });
    sync.start();
    try {
      registerIpcHandlers(db, wiki.dir, undefined, null, sync);
      handlers.get(IpcChannel.moveNote)!({}, 'A/n', 'B');
      await new Promise((r) => setTimeout(r, 250));
      expect(onChange).not.toHaveBeenCalled();
      expect(listNotes(wiki).map((n) => n.slug)).toEqual(['B/n']);
    } finally {
      sync.stop();
    }
  });

  it('CP-08-133: the section left empty without its own file leaves the sidebar, like after deleting', () => {
    section('A');
    section('B');
    note('n', 'A');
    fs.rmSync(at('A', '_section.md'));
    moveNote(wiki, 'A/n', 'B');
    expect(listSections(wiki).map((s) => s.name)).toEqual(['B']);
  });
});
