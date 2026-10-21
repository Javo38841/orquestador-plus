import type Database from 'better-sqlite3';

const REMINDERS_ENABLED = 'reminders.enabled';

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
