import type Database from 'better-sqlite3';
import {
  isTopicStatus,
  validateTopicInput,
  type Topic,
  type TopicResult,
  type TopicStatus,
} from '../../shared/learning';

interface TopicRow {
  id: number;
  title: string;
  notes: string;
  status: TopicStatus;
  created_at: string;
  updated_at: string;
}

const SELECT_TOPIC = 'SELECT id, title, notes, status, created_at, updated_at FROM topics';

function toTopic(row: TopicRow): Topic {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getTopic(db: Database.Database, id: number): Topic | null {
  const row = db.prepare(`${SELECT_TOPIC} WHERE id = ?`).get(id) as TopicRow | undefined;
  return row ? toTopic(row) : null;
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

/** All topics, newest first. */
export function listTopics(db: Database.Database): Topic[] {
  const rows = db.prepare(`${SELECT_TOPIC} ORDER BY id DESC`).all() as TopicRow[];
  return rows.map(toTopic);
}

/** New topics start as "todo" (Por empezar). */
export function createTopic(db: Database.Database, input: unknown, now = new Date()): TopicResult {
  const checked = validateTopicInput(input);
  if (!checked.ok) return checked;
  const stamp = now.toISOString();
  const info = db
    .prepare(
      "INSERT INTO topics (title, notes, status, created_at, updated_at) VALUES (?, ?, 'todo', ?, ?)",
    )
    .run(checked.title, checked.notes, stamp, stamp);
  return { ok: true, topic: getTopic(db, Number(info.lastInsertRowid))! };
}

/** Edits title and notes; status and creation date are kept. */
export function updateTopic(
  db: Database.Database,
  id: unknown,
  input: unknown,
  now = new Date(),
): TopicResult {
  const checked = validateTopicInput(input);
  if (!checked.ok) return checked;
  if (!isId(id) || !getTopic(db, id)) return { ok: false, error: 'not_found' };
  db.prepare('UPDATE topics SET title = ?, notes = ?, updated_at = ? WHERE id = ?').run(
    checked.title,
    checked.notes,
    now.toISOString(),
    id,
  );
  return { ok: true, topic: getTopic(db, id)! };
}

export function setTopicStatus(
  db: Database.Database,
  id: unknown,
  status: unknown,
  now = new Date(),
): TopicResult {
  if (!isTopicStatus(status)) return { ok: false, error: 'invalid_status' };
  if (!isId(id) || !getTopic(db, id)) return { ok: false, error: 'not_found' };
  db.prepare('UPDATE topics SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    now.toISOString(),
    id,
  );
  return { ok: true, topic: getTopic(db, id)! };
}

export function deleteTopic(db: Database.Database, id: unknown): boolean {
  if (!isId(id)) return false;
  return db.prepare('DELETE FROM topics WHERE id = ?').run(id).changes > 0;
}
