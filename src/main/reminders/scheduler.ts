import type Database from 'better-sqlite3';
import { reminderInstant } from '../../shared/reminders';
import { getRemindersEnabled } from '../settings/settings';
import { buildReminderNotification, type ReminderNotification } from './messages';

/** setTimeout cannot wait longer than a signed 32-bit number of milliseconds. */
const MAX_TIMER_MS = 2 ** 31 - 1;

export interface SchedulerOptions {
  db: Database.Database;
  /** Shows the native notification. */
  notify: (notification: ReminderNotification) => void;
  now?: () => Date;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface ReminderScheduler {
  /** Fires what is due (late ones included) and arms the timer for the next reminder. */
  start(): void;
  /** Call after anything that may change the pending reminders or the setting. */
  refresh(): void;
  stop(): void;
}

interface PendingRow {
  id: number;
  title: string;
  reminder_at: string;
}

/**
 * Notifies task reminders with a single timer aimed at the next one: no polling (RNF-10)
 * and no network (RNF-01). A reminder fires once; its stamp is written before notifying.
 */
export function createReminderScheduler(options: SchedulerOptions): ReminderScheduler {
  const { db, notify } = options;
  const now = options.now ?? (() => new Date());
  const setTimer = options.setTimer ?? ((run, ms) => setTimeout(run, ms));
  const clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as NodeJS.Timeout));
  let timer: unknown = null;

  const pending = (): PendingRow[] =>
    db
      .prepare(
        `SELECT id, title, reminder_at FROM tasks
         WHERE status <> 'done' AND reminder_at IS NOT NULL AND reminder_notified_at IS NULL`,
      )
      .all() as PendingRow[];

  function evaluate(): void {
    timer = null;
    if (!getRemindersEnabled(db)) return;
    const current = now();
    const mark = db.prepare('UPDATE tasks SET reminder_notified_at = ? WHERE id = ?');
    let next: number | null = null;
    for (const row of pending()) {
      const at = reminderInstant(row.reminder_at);
      if (at.getTime() > current.getTime()) {
        if (next === null || at.getTime() < next) next = at.getTime();
        continue;
      }
      mark.run(current.toISOString(), row.id);
      try {
        notify(
          buildReminderNotification({ title: row.title, reminderAt: row.reminder_at }, current, at),
        );
      } catch {
        // A failing notification must not stop the other reminders.
      }
    }
    if (next !== null) {
      timer = setTimer(evaluate, Math.min(Math.max(next - current.getTime(), 0), MAX_TIMER_MS));
    }
  }

  function refresh(): void {
    if (timer !== null) clearTimer(timer);
    timer = null;
    evaluate();
  }

  return {
    start: refresh,
    refresh,
    stop() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
