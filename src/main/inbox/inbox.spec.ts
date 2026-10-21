import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { captureItem, listInbox } from './inbox';

describe('inbox', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-inbox-'));
    db = openDatabase(dir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('CP-01-03: stores only title, quick_capture source and creation date', () => {
    const now = new Date('2026-03-01T10:00:00.000Z');
    const result = captureItem(db, '  Comprar cable USB-C ', now);

    expect(result).toEqual({
      ok: true,
      item: {
        id: 1,
        title: 'Comprar cable USB-C',
        source: 'quick_capture',
        createdAt: '2026-03-01T10:00:00.000Z',
      },
    });
    const columns = db.prepare('PRAGMA table_info(inbox_items)').all() as { name: string }[];
    expect(columns.map((c) => c.name)).toEqual(['id', 'title', 'source', 'created_at']);
  });

  it('CP-01-04: rejects empty and whitespace-only text without creating anything', () => {
    for (const text of ['', '   \n\t', undefined, 42]) {
      expect(captureItem(db, text)).toEqual({ ok: false, error: 'empty' });
    }
    expect(listInbox(db)).toEqual([]);
  });

  it('CP-01-05: rejects more than 500 characters and accepts exactly 500', () => {
    expect(captureItem(db, 'a'.repeat(501))).toEqual({ ok: false, error: 'too_long' });
    expect(listInbox(db)).toEqual([]);
    expect(captureItem(db, 'a'.repeat(500)).ok).toBe(true);
  });

  it('CP-01-07: lists items from newest to oldest', () => {
    captureItem(db, 'first', new Date('2026-03-01T10:00:00Z'));
    captureItem(db, 'third', new Date('2026-03-01T12:00:00Z'));
    captureItem(db, 'second', new Date('2026-03-01T11:00:00Z'));

    expect(listInbox(db).map((i) => i.title)).toEqual(['third', 'second', 'first']);
  });

  it('CP-01-02: items survive closing and reopening the database', () => {
    captureItem(db, 'persisted');
    db.close();
    db = openDatabase(dir);

    expect(listInbox(db).map((i) => i.title)).toEqual(['persisted']);
  });
});
