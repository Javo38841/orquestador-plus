/** Task reminders (RF-18). A reminder is one absolute local date and time per task. */

export type ReminderError = 'invalid_reminder' | 'reminder_series';

const REMINDER = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** Reminders closer than this to their time are "on time"; later ones are reported as overdue. */
export const REMINDER_LATE_AFTER_MS = 60_000;

/** Local `YYYY-MM-DDTHH:mm` (seconds optional), a real calendar date and a real time. */
export function isValidReminder(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = REMINDER.exec(value);
  if (!m) return false;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  if (h > 23 || mi > 59 || s > 59) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** The instant a valid reminder refers to, read in the machine's local time zone. */
export function reminderInstant(value: string): Date {
  const m = REMINDER.exec(value)!;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return new Date(y, mo - 1, d, h, mi, s);
}

/** Validates the optional `reminderAt` field of a task payload; empty means no reminder. */
export function validateReminder(
  raw: unknown,
): { ok: true; reminderAt: string | null } | { ok: false; error: ReminderError } {
  if (raw === null || raw === undefined || raw === '') return { ok: true, reminderAt: null };
  if (!isValidReminder(raw)) return { ok: false, error: 'invalid_reminder' };
  return { ok: true, reminderAt: raw };
}
