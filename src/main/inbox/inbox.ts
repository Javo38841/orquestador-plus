import type Database from 'better-sqlite3';
import { createTask } from '../tasks/tasks';
import type { TaskResult } from '../../shared/tasks';
import {
  validateCapture,
  type CaptureResult,
  type InboxItem,
  type InboxSource,
} from '../../shared/inbox';

interface InboxRow {
  id: number;
  title: string;
  source: InboxSource;
  created_at: string;
  reporter: string | null;
}

function toItem(row: InboxRow): InboxItem {
  const item: InboxItem = {
    id: row.id,
    title: row.title,
    source: row.source,
    createdAt: row.created_at,
  };
  if (row.reporter !== null) item.reporter = row.reporter;
  return item;
}

/** Validates the payload and stores it as a bare inbox item (title, source, creation date). */
export function captureItem(
  db: Database.Database,
  text: unknown,
  now: Date = new Date(),
): CaptureResult {
  const checked = validateCapture(text);
  if (!checked.ok) return checked;

  const createdAt = now.toISOString();
  const info = db
    .prepare('INSERT INTO inbox_items (title, source, created_at) VALUES (?, ?, ?)')
    .run(checked.title, 'quick_capture', createdAt);

  return {
    ok: true,
    item: {
      id: Number(info.lastInsertRowid),
      title: checked.title,
      source: 'quick_capture',
      createdAt,
    },
  };
}

/** Inbox items, newest first. */
export function listInbox(db: Database.Database): InboxItem[] {
  const rows = db
    .prepare(
      `SELECT i.id, i.title, i.source, i.created_at, r.reporter
       FROM inbox_items i LEFT JOIN portal_reports r ON r.item_id = i.id
       ORDER BY i.created_at DESC, i.id DESC`,
    )
    .all() as InboxRow[];
  return rows.map(toItem);
}

/**
 * Turns an inbox item into a task: the task is created and the item removed in one
 * transaction, so a failure leaves the item in the inbox (RNF-08).
 */
export function convertToTask(
  db: Database.Database,
  id: unknown,
  input: unknown,
  now: Date = new Date(),
): TaskResult {
  if (typeof id !== 'number' || !Number.isInteger(id)) return { ok: false, error: 'not_found' };
  return db.transaction((): TaskResult => {
    const exists = db.prepare('SELECT 1 FROM inbox_items WHERE id = ?').get(id);
    if (!exists) return { ok: false, error: 'not_found' };
    const result = createTask(db, input, now);
    if (result.ok) db.prepare('DELETE FROM inbox_items WHERE id = ?').run(id);
    return result;
  })();
}

/** Removes an item from the inbox. Returns whether it existed. */
export function discardItem(db: Database.Database, id: unknown): boolean {
  if (typeof id !== 'number' || !Number.isInteger(id)) return false;
  return db.prepare('DELETE FROM inbox_items WHERE id = ?').run(id).changes > 0;
}
