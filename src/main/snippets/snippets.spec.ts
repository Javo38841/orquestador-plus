import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { migrate, migrations } from '../db/migrations';
import { createSnippet, deleteSnippet, listSnippets, updateSnippet } from './snippets';

describe('snippets', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-snippets-'));
    db = openDatabase(dir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const make = (title: string, extra: object = {}) => {
    const result = createSnippet(db, { title, type: 'sql', content: 'SELECT 1;', ...extra });
    if (!result.ok) throw new Error(result.error);
    return result.snippet;
  };

  it('CP-13-01: a new snippet is stored and listed with its data', () => {
    const snippet = make('Usuarios activos', { content: 'SELECT *\n  FROM users;' });
    expect(snippet).toMatchObject({
      title: 'Usuarios activos',
      type: 'sql',
      content: 'SELECT *\n  FROM users;',
      tags: [],
    });
    expect(listSnippets(db)).toEqual([snippet]);
  });

  it.each([
    ['an empty title', { title: '   ', type: 'sql', content: 'x' }],
    ['an empty content', { title: 't', type: 'sql', content: '  \n ' }],
    ['an unknown type', { title: 't', type: 'credential', content: 'x' }],
    ['a missing type', { title: 't', content: 'x' }],
    ['a non-string content', { title: 't', type: 'sql', content: 5 }],
    ['invalid tags', { title: 't', type: 'sql', content: 'x', tags: ['con espacio'] }],
    ['a non-object payload', 'hola'],
  ])('CP-13-02: create rejects %s and stores nothing', (_name, payload) => {
    expect(createSnippet(db, payload).ok).toBe(false);
    expect(listSnippets(db)).toEqual([]);
  });

  it('CP-13-02: edit rejects an invalid payload and keeps the snippet as it was', () => {
    const original = make('a');
    for (const payload of [
      { title: '', type: 'sql', content: 'x' },
      { title: 'a', type: 'sql', content: '' },
      { title: 'a', type: 'nope', content: 'x' },
    ]) {
      expect(updateSnippet(db, original.id, payload).ok).toBe(false);
    }
    expect(listSnippets(db)).toEqual([original]);
  });

  it('CP-13-03: editing persists the changes and keeps the creation date', () => {
    const created = new Date('2026-03-01T10:00:00.000Z');
    const edited = new Date('2026-03-05T12:00:00.000Z');
    const first = createSnippet(
      db,
      { title: 'a', type: 'sql', content: 'x', tags: ['db'] },
      created,
    );
    if (!first.ok) throw new Error(first.error);
    const result = updateSnippet(
      db,
      first.snippet.id,
      { title: 'b', type: 'command', content: 'ls -la\n', tags: ['#Shell', 'ops'] },
      edited,
    );
    expect(result).toMatchObject({
      ok: true,
      snippet: {
        title: 'b',
        type: 'command',
        content: 'ls -la\n',
        tags: ['ops', 'shell'],
        createdAt: created.toISOString(),
        updatedAt: edited.toISOString(),
      },
    });
    expect(listSnippets(db)[0]).toMatchObject({ title: 'b', tags: ['ops', 'shell'] });
  });

  it('CP-13-03: editing a missing snippet is not_found', () => {
    expect(updateSnippet(db, 99, { title: 'a', type: 'sql', content: 'x' })).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('CP-13-04: deleting removes the snippet and unlinks its tags', () => {
    const snippet = make('a', { tags: ['db', 'ops'] });
    const keep = make('b', { tags: ['db'] });
    expect(deleteSnippet(db, snippet.id)).toBe(true);
    expect(listSnippets(db)).toEqual([keep]);
    const links = db.prepare('SELECT snippet_id FROM snippet_tags').all();
    expect(links).toEqual([{ snippet_id: keep.id }]);
  });

  it('CP-13-04: deleting an unknown or invalid id returns false', () => {
    expect(deleteSnippet(db, 99)).toBe(false);
    expect(deleteSnippet(db, 'x')).toBe(false);
  });

  it('CP-13-06: the type is kept so the list can be filtered by it', () => {
    make('q', { type: 'sql' });
    make('c', { type: 'command' });
    expect(listSnippets(db).map((s) => s.type)).toEqual(['command', 'sql']);
  });

  it('CP-13-07: tags come back per snippet so the list can be filtered by tag', () => {
    make('a', { tags: ['db'] });
    make('b', { tags: ['ops', 'db'] });
    make('c');
    expect(listSnippets(db).map((s) => s.tags)).toEqual([[], ['db', 'ops'], ['db']]);
  });

  it('CP-13-09: the migration adds the snippets tables without touching existing data', () => {
    const old = new Database(':memory:');
    old.pragma('foreign_keys = ON');
    const before = migrations.filter((m) => m.version < 13);
    migrate(old, before);
    old
      .prepare(
        "INSERT INTO inbox_items (title, source, created_at) VALUES ('x', 'quick_capture', 'now')",
      )
      .run();

    expect(migrate(old)).toBe(migrations.at(-1)!.version);
    expect(old.prepare('SELECT title FROM inbox_items').all()).toEqual([{ title: 'x' }]);
    expect(old.prepare('SELECT COUNT(*) AS n FROM snippets').get()).toEqual({ n: 0 });
    expect(migrations.filter((m) => m.version < 13)).toEqual(before);
    old.close();
  });
});
