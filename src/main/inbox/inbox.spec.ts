import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { listTasks } from '../tasks/tasks';
import { captureItem, convertToTask, discardItem, listInbox } from './inbox';

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

  describe('classify', () => {
    it('CP-01-09: converting with the captured title keeps that title', () => {
      captureItem(db, 'Revisar logs');
      const result = convertToTask(db, 1, {
        title: 'Revisar logs',
        dueDate: null,
        projectId: null,
      });
      expect(result.ok && result.task.title).toBe('Revisar logs');
      expect(listInbox(db)).toEqual([]);
      expect(listTasks(db).map((t) => t.title)).toEqual(['Revisar logs']);
    });

    it('CP-07-07: converting an item can assign tags to the new task', () => {
      captureItem(db, 'Rotar claves');
      const result = convertToTask(db, 1, { title: 'Rotar claves', tags: ['Infra', 'seguridad'] });
      expect(result.ok && result.task.tags).toEqual(['infra', 'seguridad']);
      expect(listTasks(db)[0].tags).toEqual(['infra', 'seguridad']);
    });

    it('CP-07-07: an invalid tag keeps the item in the inbox', () => {
      captureItem(db, 'Rotar claves');
      expect(convertToTask(db, 1, { title: 'Rotar claves', tags: ['dos palabras'] })).toEqual({
        ok: false,
        error: 'tag_spaces',
      });
      expect(listInbox(db)).toHaveLength(1);
    });

    it('CP-01-08: converting assigns project and due date and removes the item', () => {
      captureItem(db, 'Arreglar sensor');
      const result = convertToTask(db, 1, {
        title: 'Arreglar sensor',
        dueDate: '2026-04-01',
        projectId: null,
        newProjectName: 'cabina',
      });
      expect(result.ok && result.task.projectName).toBe('cabina');
      expect(result.ok && result.task.dueDate).toBe('2026-04-01');
      expect(listInbox(db)).toEqual([]);
    });

    it('CP-01-10: discarding removes the item from the inbox', () => {
      captureItem(db, 'Ruido');
      expect(discardItem(db, 1)).toBe(true);
      expect(listInbox(db)).toEqual([]);
      expect(discardItem(db, 1)).toBe(false);
    });

    it('CP-01-11: leaving an item for later changes nothing (no call is made)', () => {
      captureItem(db, 'Luego');
      const before = listInbox(db);
      expect(listInbox(db)).toEqual(before);
      expect(listTasks(db)).toEqual([]);
    });

    it('CP-01-12: if creating the task fails the item stays in the inbox', () => {
      captureItem(db, 'No se pierde');
      db.exec(
        "CREATE TRIGGER fail_task BEFORE INSERT ON tasks BEGIN SELECT RAISE(ABORT, 'boom'); END",
      );
      expect(() =>
        convertToTask(db, 1, {
          title: 'No se pierde',
          dueDate: null,
          projectId: null,
          newProjectName: 'nuevo',
        }),
      ).toThrow();
      expect(listInbox(db)).toHaveLength(1);
      expect(db.prepare('SELECT COUNT(*) AS n FROM projects').get()).toEqual({ n: 0 });
    });

    it('rejects an invalid payload or unknown item without touching the inbox', () => {
      captureItem(db, 'Algo');
      expect(convertToTask(db, 1, { title: '  ' })).toEqual({ ok: false, error: 'empty' });
      expect(convertToTask(db, 99, { title: 'x' })).toEqual({ ok: false, error: 'not_found' });
      expect(convertToTask(db, 'a', { title: 'x' })).toEqual({ ok: false, error: 'not_found' });
      expect(listInbox(db)).toHaveLength(1);
    });
  });

  it('CP-N08-02: a failure while classifying leaves the item and creates no task', () => {
    const captured = captureItem(db, 'Algo');
    if (!captured.ok) throw new Error('capture failed');
    db.exec(
      "CREATE TRIGGER fail_delete BEFORE DELETE ON inbox_items BEGIN SELECT RAISE(ABORT, 'boom'); END",
    );

    expect(() => convertToTask(db, captured.item.id, { title: 'Algo' })).toThrow('boom');

    expect(listTasks(db)).toEqual([]);
    expect(listInbox(db)).toHaveLength(1);
  });
});
