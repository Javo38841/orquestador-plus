import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { slugFromTitle } from '../shared/wiki';
import { DATABASE_FILE, openDatabase } from './db/database';
import { currentVersion, migrations } from './db/migrations';
import { createNote, getNote, rebuildIndex, updateNote, type Wiki } from './wiki/wiki';

describe('RNF-12: the data folder is portable between Windows and Fedora', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-port-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const seed = (db: Database.Database): void => {
    db.prepare(
      "INSERT INTO inbox_items (title, source, created_at) VALUES ('x', 'quick_capture', 'now')",
    ).run();
    db.prepare(
      "INSERT INTO inbox_items (title, source, created_at) VALUES ('y', 'quick_capture', 'now')",
    ).run();
  };

  const wikiAt = (dir: string, db: Database.Database): Wiki => ({
    db,
    dir: path.join(dir, 'wiki'),
  });

  it('CP-N12-01: copying only datos.db to another folder keeps records and migration version', () => {
    const from = path.join(root, 'windows');
    const to = path.join(root, 'fedora');
    const db = openDatabase(from);
    seed(db);
    db.close();
    expect(fs.existsSync(path.join(from, `${DATABASE_FILE}-wal`))).toBe(false);
    expect(fs.existsSync(path.join(from, `${DATABASE_FILE}-shm`))).toBe(false);

    fs.mkdirSync(to);
    fs.copyFileSync(path.join(from, DATABASE_FILE), path.join(to, DATABASE_FILE));
    const copy = openDatabase(to);

    expect(copy.prepare('SELECT title FROM inbox_items ORDER BY id').all()).toEqual([
      { title: 'x' },
      { title: 'y' },
    ]);
    expect(currentVersion(copy)).toBe(migrations.at(-1)!.version);
    copy.close();
  });

  it('CP-N12-01: wal_checkpoint(TRUNCATE) leaves all data in datos.db before copying it', () => {
    const from = path.join(root, 'a');
    const to = path.join(root, 'b');
    const db = openDatabase(from);
    seed(db);
    db.pragma('wal_checkpoint(TRUNCATE)');
    fs.mkdirSync(to);
    // Copied while the connection is still open: the WAL is empty, so datos.db is complete.
    fs.copyFileSync(path.join(from, DATABASE_FILE), path.join(to, DATABASE_FILE));
    db.close();

    const copy = openDatabase(to);
    expect(copy.prepare('SELECT COUNT(*) AS n FROM inbox_items').get()).toEqual({ n: 2 });
    copy.close();
  });

  it('CP-N12-02: reopening a WAL database elsewhere applies no migration and loses nothing', () => {
    const from = path.join(root, 'a');
    const to = path.join(root, 'b');
    const db = openDatabase(from);
    seed(db);
    db.close();
    fs.mkdirSync(to);
    fs.copyFileSync(path.join(from, DATABASE_FILE), path.join(to, DATABASE_FILE));

    const copy = openDatabase(to);
    // Migrations are tracked in user_version; re-running them would fail on existing tables.
    expect(currentVersion(copy)).toBe(migrations.at(-1)!.version);
    expect(copy.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(copy.prepare('SELECT COUNT(*) AS n FROM inbox_items').get()).toEqual({ n: 2 });
    copy.close();
  });

  it('CP-N12-03: a saved note is UTF-8 without BOM and uses only LF', () => {
    const db = openDatabase(root);
    const wiki = wikiAt(root, db);
    createNote(wiki, { title: 'Año nuevo ✓', content: 'uno\r\ndos\rtres\ncuatro' });
    updateNote(wiki, 'Año nuevo ✓', { title: 'Año nuevo ✓', content: 'a\r\nb' });
    const bytes = fs.readFileSync(path.join(wiki.dir, 'Año nuevo ✓.md'));
    db.close();

    expect(bytes.subarray(0, 3)).not.toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    const text = bytes.toString('utf8');
    expect(text).not.toContain('\r');
    expect(Buffer.from(text, 'utf8').equals(bytes)).toBe(true);
    expect(text.endsWith('\n\na\nb')).toBe(true);
  });

  it('CP-N12-04: CRLF, LF and BOM files give the same title, content and links', () => {
    const db = openDatabase(root);
    const wiki = wikiAt(root, db);
    fs.mkdirSync(wiki.dir);
    const body = 'Ver [[Otra nota]] y [[Más]].\nFin';
    const header =
      '---\ntitle: "Nota"\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\n\n';
    const as = (title: string, crlf: boolean, bom = false): string => {
      const text = header.replace('"Nota"', `"${title}"`) + body;
      return (bom ? '\uFEFF' : '') + (crlf ? text.replace(/\n/g, '\r\n') : text);
    };
    fs.writeFileSync(path.join(wiki.dir, 'lf.md'), as('Nota', false));
    fs.writeFileSync(path.join(wiki.dir, 'crlf.md'), as('Nota2', true));
    fs.writeFileSync(path.join(wiki.dir, 'bom.md'), as('Nota3', true, true));
    rebuildIndex(wiki);

    const read = (slug: string) => {
      const r = getNote(wiki, slug);
      if (!r.ok) throw new Error(slug);
      return r.note;
    };
    const lf = read('lf');
    for (const slug of ['crlf', 'bom']) {
      const n = read(slug);
      expect(n.title).toMatch(/^Nota\d$/);
      expect(n.content.replace(/\r\n/g, '\n')).toBe(lf.content);
      expect(n.links.map((l) => l.key)).toEqual(lf.links.map((l) => l.key));
    }
    expect(lf.title).toBe('Nota');
    expect(lf.links.map((l) => l.key)).toEqual(['otra nota', 'más']);
    db.close();
  });

  it('CP-N12-05: file names are valid on Windows and Linux', () => {
    const cases = [
      'a/b\\c:d*e?f"g<h>i|j',
      'fin con puntos...',
      'fin con espacio   ',
      'CON',
      'nul',
      'COM1',
      'lpt9',
      'CON.backup',
      'Ñandú: tilde é',
      '🚀'.repeat(150),
      'x'.repeat(300),
    ];
    for (const title of cases) {
      const slug = slugFromTitle(title);
      expect(Array.from(slug).length).toBeLessThanOrEqual(100);
      // eslint-disable-next-line no-control-regex
      expect(slug).not.toMatch(/[\\/:*?"<>|\u0000-\u001f]/);
      expect(slug).not.toMatch(/[. ]$/);
      expect(slug.split('.')[0]).not.toMatch(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i);
      expect(slug).not.toMatch(/[\ud800-\udbff]$/); // no split emoji
      expect(slug.length).toBeGreaterThan(0);
    }
    expect(slugFromTitle('Ñandú é')).toBe('Ñandú é');
  });

  it('CP-N12-06: titles differing only in case or Unicode normalization are duplicates', () => {
    const db = openDatabase(root);
    const wiki = wikiAt(root, db);
    expect(createNote(wiki, { title: 'Café', content: '' }).ok).toBe(true);
    const nfd = 'Cafe\u0301';
    expect(createNote(wiki, { title: nfd, content: '' })).toEqual({
      ok: false,
      error: 'duplicate',
    });
    expect(createNote(wiki, { title: 'CAFÉ', content: '' })).toEqual({
      ok: false,
      error: 'duplicate',
    });
    expect(createNote(wiki, { title: 'CAFE\u0301', content: '' })).toEqual({
      ok: false,
      error: 'duplicate',
    });
    // Only one file, with an NFC name, so a case-insensitive file system has no collision.
    const names = fs.readdirSync(wiki.dir);
    expect(names).toEqual(['Café.md'.normalize('NFC')]);
    expect(names[0]).toBe(names[0].normalize('NFC'));
    expect(slugFromTitle(nfd)).toBe(slugFromTitle('Café'));
    db.close();
  });

  it('CP-N12-07: paths with spaces and accents resolve inside wiki/', () => {
    const odd = path.join(root, 'Mis datos ñandú');
    const db = openDatabase(odd);
    const wiki = wikiAt(odd, db);
    expect(createNote(wiki, { title: 'Nota uno', content: 'x' }).ok).toBe(true);
    expect(fs.existsSync(path.join(odd, 'wiki', 'Nota uno.md'))).toBe(true);
    for (const slug of ['../datos', '..\\datos', 'a/b', 'C:\\x']) {
      expect(getNote(wiki, slug)).toEqual({ ok: false, error: 'invalid' });
    }
    db.close();
  });

  it('CP-N12-08: the database stores no absolute system paths', () => {
    const dir = path.join(root, 'data dir');
    const db = openDatabase(dir);
    const wiki = wikiAt(dir, db);
    createNote(wiki, { title: 'Nota', content: 'ver [[Otra]]' });
    seed(db);

    const absolute = /^(?:[A-Za-z]:[\\/]|\/|\\\\)/;
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '%\\_%fts%' ESCAPE '\\'",
      )
      .all() as { name: string }[];
    for (const { name } of tables) {
      let rows: Record<string, unknown>[];
      try {
        rows = db.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[];
      } catch {
        continue; // virtual table that cannot be scanned
      }
      for (const row of rows) {
        for (const value of Object.values(row)) {
          if (typeof value === 'string') {
            expect(value, `${name}`).not.toMatch(absolute);
            expect(value, `${name}`).not.toContain(dir);
          }
        }
      }
    }
    db.close();
  });
});
