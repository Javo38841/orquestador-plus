import type Database from 'better-sqlite3';
import { validateCapture, type CaptureResult, type InboxItem } from '../../shared/inbox';

interface InboxRow {
  id: number;
  title: string;
  source: 'quick_capture';
  created_at: string;
}

function toItem(row: InboxRow): InboxItem {
  return { id: row.id, title: row.title, source: row.source, createdAt: row.created_at };
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
      'SELECT id, title, source, created_at FROM inbox_items ORDER BY created_at DESC, id DESC',
    )
    .all() as InboxRow[];
  return rows.map(toItem);
}
