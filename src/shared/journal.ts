/** Daily development journal (RF-12). Shared so main and renderer validate alike. */

export const JOURNAL_TEXT_MAX_LENGTH = 50_000;

export interface JournalEntry {
  /** Local calendar day, `YYYY-MM-DD`. One entry per day. */
  date: string;
  text: string;
  /** ISO-8601 UTC timestamp. */
  updatedAt: string;
}

export type JournalError = 'invalid' | 'too_long';

/** `entry` is null when the save removed the day's entry or there was nothing to save. */
export type JournalResult =
  { ok: true; entry: JournalEntry | null } | { ok: false; error: JournalError };

/** True for a real calendar day written as `YYYY-MM-DD`. */
export function isJournalDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/** The machine's local calendar day as `YYYY-MM-DD`. */
export function localJournalDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Checks a save payload. An empty or blank text is valid: it means "delete the entry". */
export function validateJournalInput(
  date: unknown,
  text: unknown,
): { ok: true; date: string; text: string } | { ok: false; error: JournalError } {
  if (!isJournalDate(date) || typeof text !== 'string') return { ok: false, error: 'invalid' };
  if (text.length > JOURNAL_TEXT_MAX_LENGTH) return { ok: false, error: 'too_long' };
  return { ok: true, date, text };
}

/** Newest day first. */
export function sortJournal(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
