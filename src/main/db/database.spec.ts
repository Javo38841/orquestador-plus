import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { DATABASE_FILE, openDatabase } from './database';
import { currentVersion, migrate, migrations, type Migration } from './migrations';

describe('migrate', () => {
  it('applies every migration on an empty database', () => {
    const db = new Database(':memory:');
    expect(migrate(db)).toBe(migrations.at(-1)!.version);
  });

  it('is idempotent', () => {
    const db = new Database(':memory:');
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
    expect(currentVersion(db)).toBe(migrations.at(-1)!.version);
  });

  it('rolls back the whole batch when one migration fails', () => {
    const db = new Database(':memory:');
    const broken: Migration[] = [
      { version: 1, name: 'ok', up: 'CREATE TABLE a (id INTEGER PRIMARY KEY);' },
      { version: 2, name: 'broken', up: 'CREATE TABLE b (' },
    ];
    expect(() => migrate(db, broken)).toThrow();
    expect(currentVersion(db)).toBe(0);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
    expect(tables).toEqual([]);
  });
});

describe('openDatabase', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates the database file in WAL mode with the schema applied', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-db-'));
    const db = openDatabase(path.join(dir, 'nested'));

    expect(fs.existsSync(path.join(dir, 'nested', DATABASE_FILE))).toBe(true);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(currentVersion(db)).toBe(migrations.at(-1)!.version);
    db.close();
  });

  it('CP-N08-01: a freshly opened database reports journal_mode wal', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-db-'));
    const db = openDatabase(dir);

    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    db.close();
  });

  it('CP-N08-06: committed data survives when the connection is never closed', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-db-'));
    const live = path.join(dir, 'live');
    const crashed = path.join(dir, 'crashed');
    const db = openDatabase(live);
    db.prepare(
      "INSERT INTO inbox_items (title, source, created_at) VALUES ('x', 'quick_capture', 'now')",
    ).run();

    // Snapshot the files as a killed process would leave them: no checkpoint, no close.
    fs.mkdirSync(crashed);
    for (const name of fs.readdirSync(live)) {
      fs.copyFileSync(path.join(live, name), path.join(crashed, name));
    }
    const reopened = openDatabase(crashed);

    expect(reopened.prepare('SELECT title FROM inbox_items').all()).toEqual([{ title: 'x' }]);
    reopened.close();
    db.close();
  });

  it('supports FTS5 for global search (RNF-05)', () => {
    const db = new Database(':memory:');
    db.exec('CREATE VIRTUAL TABLE search USING fts5(body)');
    db.prepare('INSERT INTO search (body) VALUES (?)').run('migración de la tabla recurrences');
    const hits = db.prepare('SELECT body FROM search WHERE search MATCH ?').all('recurrences');
    expect(hits).toHaveLength(1);
  });
});
