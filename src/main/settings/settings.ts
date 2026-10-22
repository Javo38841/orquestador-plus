import type Database from 'better-sqlite3';

const REMINDERS_ENABLED = 'reminders.enabled';
const BOARD_PROJECT = 'board.project';

/** Task reminders notify unless the user turned them off (RF-18). */
export function getRemindersEnabled(db: Database.Database): boolean {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(REMINDERS_ENABLED) as
    { value: string } | undefined;
  return row?.value !== '0';
}

/** Persists the reminders switch; anything but a boolean is rejected. Returns the stored value. */
export function setRemindersEnabled(db: Database.Database, enabled: unknown): boolean {
  if (typeof enabled !== 'boolean') throw new Error('Invalid reminders setting');
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run(REMINDERS_ENABLED, enabled ? '1' : '0');
  return enabled;
}

/** Id of the project the Tablero last showed, or null for "General". */
export function getBoardProject(db: Database.Database): number | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(BOARD_PROJECT) as
    { value: string } | undefined;
  const id = row ? Number(row.value) : NaN;
  return Number.isInteger(id) ? id : null;
}

/** Remembers the chosen board; anything but an integer id or null is rejected. Returns the stored value. */
export function setBoardProject(db: Database.Database, id: unknown): number | null {
  if (id !== null && !Number.isInteger(id)) throw new Error('Invalid board project');
  if (id === null) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(BOARD_PROJECT);
    return null;
  }
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  ).run(BOARD_PROJECT, String(id));
  return id as number;
}
