import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { migrate, migrations } from '../db/migrations';
import { createTopic, deleteTopic, listTopics, setTopicStatus, updateTopic } from './learning';

describe('learning topics', () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orq-learning-'));
    db = openDatabase(dir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const make = (title: string) => {
    const result = createTopic(db, { title });
    if (!result.ok) throw new Error(result.error);
    return result.topic;
  };

  it('CP-14-01: a new topic starts as "todo" with its creation date', () => {
    expect(listTopics(db)).toEqual([]);
    const topic = createTopic(db, { title: 'Rust' }, new Date('2026-03-01T10:00:00.000Z'));
    expect(topic).toMatchObject({
      ok: true,
      topic: { title: 'Rust', status: 'todo', createdAt: '2026-03-01T10:00:00.000Z' },
    });
    expect(listTopics(db)).toHaveLength(1);
  });

  it('CP-14-02: a blank title is rejected and nothing is stored', () => {
    expect(createTopic(db, { title: '   ' })).toEqual({ ok: false, error: 'empty_title' });
    expect(createTopic(db, { title: '' })).toEqual({ ok: false, error: 'empty_title' });
    expect(listTopics(db)).toEqual([]);
  });

  it('CP-14-03: the status changes between the three states and persists', () => {
    const { id } = make('Rust');
    for (const status of ['in_progress', 'done', 'todo'] as const) {
      expect(setTopicStatus(db, id, status)).toMatchObject({ ok: true, topic: { status } });
      expect(listTopics(db)[0]!.status).toBe(status);
    }
  });

  it('CP-14-04: an invalid status is rejected and the topic is untouched', () => {
    const { id } = make('Rust');
    for (const bad of ['finished', '', 3, null, undefined]) {
      expect(setTopicStatus(db, id, bad)).toEqual({ ok: false, error: 'invalid_status' });
    }
    expect(listTopics(db)[0]!.status).toBe('todo');
  });

  it('CP-14-05: title and notes can be edited and keep status and creation date', () => {
    const { id, createdAt } = make('Rust');
    setTopicStatus(db, id, 'in_progress');
    const result = updateTopic(db, id, { title: ' Rust avanzado ', notes: 'ownership\nlifetimes' });
    expect(result).toMatchObject({
      ok: true,
      topic: {
        title: 'Rust avanzado',
        notes: 'ownership\nlifetimes',
        status: 'in_progress',
        createdAt,
      },
    });
    expect(listTopics(db)[0]).toMatchObject({
      title: 'Rust avanzado',
      notes: 'ownership\nlifetimes',
    });
    expect(updateTopic(db, id, { title: ' ' })).toEqual({ ok: false, error: 'empty_title' });
    expect(updateTopic(db, 999, { title: 'x' })).toEqual({ ok: false, error: 'not_found' });
  });

  it('CP-14-06: deleting removes the topic; a missing one returns false', () => {
    const { id } = make('Rust');
    make('Go');
    expect(deleteTopic(db, id)).toBe(true);
    expect(listTopics(db).map((t) => t.title)).toEqual(['Go']);
    expect(deleteTopic(db, id)).toBe(false);
    expect(deleteTopic(db, 'x')).toBe(false);
    expect(setTopicStatus(db, id, 'done')).toEqual({ ok: false, error: 'not_found' });
  });

  it('CP-14-09: the migration adds the topics table without touching existing data', () => {
    const old = new Database(':memory:');
    old.pragma('foreign_keys = ON');
    const before = migrations.filter((m) => m.version < 14);
    migrate(old, before);
    old
      .prepare(
        "INSERT INTO inbox_items (title, source, created_at) VALUES ('x', 'quick_capture', 'now')",
      )
      .run();

    expect(migrate(old)).toBe(migrations.at(-1)!.version);
    expect(old.prepare('SELECT title FROM inbox_items').all()).toEqual([{ title: 'x' }]);
    expect(old.prepare('SELECT COUNT(*) AS n FROM topics').get()).toEqual({ n: 0 });
    expect(migrations.filter((m) => m.version < 14)).toEqual(before);
    old.close();
  });
});
