import type Database from 'better-sqlite3';
import { createBug } from '../bugs/bugs';
import { createTask } from '../tasks/tasks';
import { createNote, type Wiki } from '../wiki/wiki';
import type { TaskResult } from '../../shared/tasks';
import {
  isInboxConvertType,
  validateCapture,
  validateInboxBug,
  type InboxConvertResult,
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

/** Thrown inside a transaction to undo it and hand the failure back to the caller. */
class Rollback extends Error {
  constructor(readonly result: InboxConvertResult) {
    super('rollback');
  }
}

function isId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id);
}

/** Turns an inbox item into a bug; the bug is created and the item removed in one transaction (RNF-08). */
export function convertToBug(
  db: Database.Database,
  id: unknown,
  input: unknown,
  now: Date = new Date(),
): InboxConvertResult {
  if (!isId(id)) return { ok: false, error: 'not_found' };
  const checked = validateInboxBug(input);
  if (!checked.ok) return checked;
  return db.transaction((): InboxConvertResult => {
    if (!db.prepare('SELECT 1 FROM inbox_items WHERE id = ?').get(id)) {
      return { ok: false, error: 'not_found' };
    }
    const result = createBug(db, input, now);
    if (!result.ok) return result;
    db.prepare('DELETE FROM inbox_items WHERE id = ?').run(id);
    return { ok: true, type: 'bug', bug: result.bug };
  })();
}

/**
 * Turns an inbox item into a wiki note whose content is the captured text. The item is removed first
 * and the file written last, all inside one transaction: if the note cannot be created (duplicate
 * title, file write failure) the removal is undone, and no file is left behind (RNF-08).
 */
export function convertToNote(
  wiki: Wiki,
  id: unknown,
  input: unknown,
  now: Date = new Date(),
): InboxConvertResult {
  const { db } = wiki;
  if (!isId(id)) return { ok: false, error: 'not_found' };
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'invalid' };
  const raw = input as Record<string, unknown>;
  if (raw['content'] !== undefined && typeof raw['content'] !== 'string') {
    return { ok: false, error: 'invalid' };
  }
  try {
    return db.transaction((): InboxConvertResult => {
      const row = db.prepare('SELECT title FROM inbox_items WHERE id = ?').get(id) as
        { title: string } | undefined;
      if (!row) return { ok: false, error: 'not_found' };
      // The note keeps the text as it was captured, whatever title the user chose.
      const noteInput = { ...raw, content: row.title };
      db.prepare('DELETE FROM inbox_items WHERE id = ?').run(id);
      const result = createNote(wiki, noteInput, now);
      if (!result.ok) throw new Rollback(result);
      return { ok: true, type: 'note', note: result.note };
    })();
  } catch (error) {
    if (error instanceof Rollback) return error.result;
    throw error;
  }
}

/** Converts an item into what `conversion.type` says, after checking the payload. */
export function convertItem(
  wiki: Wiki,
  id: unknown,
  conversion: unknown,
  now: Date = new Date(),
): InboxConvertResult {
  if (typeof conversion !== 'object' || conversion === null) return { ok: false, error: 'invalid' };
  const { type, input } = conversion as Record<string, unknown>;
  if (!isInboxConvertType(type)) return { ok: false, error: 'invalid' };
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'invalid' };
  if (type === 'bug') return convertToBug(wiki.db, id, input, now);
  if (type === 'note') return convertToNote(wiki, id, input, now);
  const result = convertToTask(wiki.db, id, input, now);
  return result.ok ? { ok: true, type: 'task', task: result.task } : result;
}

/** Removes an item from the inbox. Returns whether it existed. */
export function discardItem(db: Database.Database, id: unknown): boolean {
  if (typeof id !== 'number' || !Number.isInteger(id)) return false;
  return db.prepare('DELETE FROM inbox_items WHERE id = ?').run(id).changes > 0;
}
