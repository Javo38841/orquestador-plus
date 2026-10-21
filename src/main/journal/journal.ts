import type Database from 'better-sqlite3';
import { validateJournalInput, type JournalEntry, type JournalResult } from '../../shared/journal';

interface JournalRow {
  date: string;
  text: string;
  updated_at: string;
}

function toEntry(row: JournalRow): JournalEntry {
  return { date: row.date, text: row.text, updatedAt: row.updated_at };
}

/** All entries, most recent day first. */
export function listJournal(db: Database.Database): JournalEntry[] {
  const rows = db
    .prepare('SELECT date, text, updated_at FROM journal_entries ORDER BY date DESC')
    .all() as JournalRow[];
  return rows.map(toEntry);
}

/**
 * Upserts the entry of a day (one per day). A blank text deletes the day's entry, and
 * creates nothing when there was none.
 */
export function saveJournalEntry(
  db: Database.Database,
  date: unknown,
  text: unknown,
  now = new Date(),
): JournalResult {
  const checked = validateJournalInput(date, text);
  if (!checked.ok) return checked;

  if (checked.text.trim().length === 0) {
    db.prepare('DELETE FROM journal_entries WHERE date = ?').run(checked.date);
    return { ok: true, entry: null };
  }

  const stamp = now.toISOString();
  db.prepare(
    `INSERT INTO journal_entries (date, text, created_at, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (date) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
  ).run(checked.date, checked.text, stamp, stamp);
  return { ok: true, entry: { date: checked.date, text: checked.text, updatedAt: stamp } };
}
