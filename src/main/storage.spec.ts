import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DATABASE_FILE } from './db/database';
import { currentVersion, migrations } from './db/migrations';
import { initStorage, type Storage } from './storage';

describe('initStorage', () => {
  let root: string;
  let storage: Storage | undefined;

  const freshRoot = (): string => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-storage-'));
    return root;
  };

  afterEach(() => {
    storage?.db.close();
    storage = undefined;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('CP-N09-02: creates a missing data folder with database and subfolders', () => {
    const dataDir = path.join(freshRoot(), 'missing', 'data');

    expect(() => (storage = initStorage(dataDir))).not.toThrow();

    expect(fs.existsSync(path.join(dataDir, DATABASE_FILE))).toBe(true);
    expect(fs.statSync(path.join(dataDir, 'wiki')).isDirectory()).toBe(true);
    expect(fs.statSync(path.join(dataDir, 'adjuntos')).isDirectory()).toBe(true);
    expect(currentVersion(storage!.db)).toBe(migrations.at(-1)!.version);
  });

  it('CP-N09-03: reopening an existing folder keeps its data and repeats no migration', () => {
    const dataDir = freshRoot();
    storage = initStorage(dataDir);
    storage.db
      .prepare("INSERT INTO tasks (title, created_at) VALUES ('keep me', '2026-01-01')")
      .run();
    fs.writeFileSync(path.join(dataDir, 'wiki', 'nota.md'), 'contenido');
    const version = currentVersion(storage.db);
    storage.db.close();

    storage = initStorage(dataDir);

    expect(storage.db.prepare('SELECT title FROM tasks').all()).toEqual([{ title: 'keep me' }]);
    expect(fs.readFileSync(path.join(dataDir, 'wiki', 'nota.md'), 'utf8')).toBe('contenido');
    expect(currentVersion(storage.db)).toBe(version);
  });

  it('CP-N09-04: an existing empty folder gets the database and subfolders', () => {
    const dataDir = freshRoot();

    expect(() => (storage = initStorage(dataDir))).not.toThrow();

    expect(fs.existsSync(path.join(dataDir, DATABASE_FILE))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'wiki'))).toBe(true);
    expect(fs.existsSync(path.join(dataDir, 'adjuntos'))).toBe(true);
  });

  it('CP-N09-04: only the missing subfolders are created when some exist', () => {
    const dataDir = freshRoot();
    fs.mkdirSync(path.join(dataDir, 'wiki'));
    fs.writeFileSync(path.join(dataDir, 'wiki', 'a.md'), 'x');

    storage = initStorage(dataDir);

    expect(fs.existsSync(path.join(dataDir, 'adjuntos'))).toBe(true);
    expect(fs.readFileSync(path.join(dataDir, 'wiki', 'a.md'), 'utf8')).toBe('x');
  });
});
