/** Recurrence rules for task series (RF-06), stored as a small RRULE subset. */

export type RecurrenceKind = 'once' | 'daily' | 'weekly' | 'monthly';

export const RECURRENCE_KINDS: readonly RecurrenceKind[] = ['once', 'daily', 'weekly', 'monthly'];

/**
 * `once` is "no series". `weekday` is ISO (1 = Monday … 7 = Sunday); `monthDay` is 1–31.
 */
export type RecurrenceRule =
  | { kind: 'once' }
  | { kind: 'daily' }
  | { kind: 'weekly'; weekday: number }
  | { kind: 'monthly'; monthDay: number };

/** A rule that generates instances (everything but `once`). */
export type SeriesRule = Exclude<RecurrenceRule, { kind: 'once' }>;

export type RecurrenceError =
  'invalid_recurrence' | 'recurrence_weekday' | 'recurrence_month_day' | 'recurrence_due_required';

const RRULE_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

export function isSeriesRule(rule: RecurrenceRule | null | undefined): rule is SeriesRule {
  return rule != null && rule.kind !== 'once';
}

/** Validates the rule sent over IPC (unknown) and returns a clean copy. */
export function validateRecurrence(
  input: unknown,
): { ok: true; rule: RecurrenceRule } | { ok: false; error: RecurrenceError } {
  if (input === undefined || input === null) return { ok: true, rule: { kind: 'once' } };
  if (typeof input !== 'object') return { ok: false, error: 'invalid_recurrence' };
  const raw = input as Record<string, unknown>;
  switch (raw['kind']) {
    case 'once':
      return { ok: true, rule: { kind: 'once' } };
    case 'daily':
      return { ok: true, rule: { kind: 'daily' } };
    case 'weekly': {
      const day = raw['weekday'];
      if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7) {
        return { ok: false, error: 'recurrence_weekday' };
      }
      return { ok: true, rule: { kind: 'weekly', weekday: day } };
    }
    case 'monthly': {
      const day = raw['monthDay'];
      if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 31) {
        return { ok: false, error: 'recurrence_month_day' };
      }
      return { ok: true, rule: { kind: 'monthly', monthDay: day } };
    }
    default:
      return { ok: false, error: 'invalid_recurrence' };
  }
}

export function toRRule(rule: SeriesRule): string {
  switch (rule.kind) {
    case 'daily':
      return 'FREQ=DAILY';
    case 'weekly':
      return `FREQ=WEEKLY;BYDAY=${RRULE_DAYS[rule.weekday - 1]}`;
    case 'monthly':
      return `FREQ=MONTHLY;BYMONTHDAY=${rule.monthDay}`;
  }
}

/** Parses what `toRRule` writes; null when the text is not one of our rules. */
export function fromRRule(text: string): SeriesRule | null {
  if (text === 'FREQ=DAILY') return { kind: 'daily' };
  const weekly = /^FREQ=WEEKLY;BYDAY=(MO|TU|WE|TH|FR|SA|SU)$/.exec(text);
  if (weekly) return { kind: 'weekly', weekday: RRULE_DAYS.indexOf(weekly[1]) + 1 };
  const monthly = /^FREQ=MONTHLY;BYMONTHDAY=(\d{1,2})$/.exec(text);
  if (monthly) {
    const result = validateRecurrence({ kind: 'monthly', monthDay: Number(monthly[1]) });
    return result.ok ? (result.rule as SeriesRule) : null;
  }
  return null;
}

// Dates are `YYYY-MM-DD` strings handled in UTC so DST never shifts a day.
function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** Day `monthDay` of the month `offset` months after `date`, clamped to the month's length. */
function monthlyOn(date: string, monthDay: number, offset: number): string {
  const d = parse(date);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
  const day = Math.min(monthDay, daysInMonth(first.getUTCFullYear(), first.getUTCMonth()));
  return format(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), day)));
}

/** First date of the rule on or after `date`. */
export function firstOnOrAfter(rule: SeriesRule, date: string): string {
  switch (rule.kind) {
    case 'daily':
      return date;
    case 'weekly': {
      const iso = parse(date).getUTCDay() || 7;
      return addDays(date, (rule.weekday - iso + 7) % 7);
    }
    case 'monthly': {
      const thisMonth = monthlyOn(date, rule.monthDay, 0);
      return thisMonth >= date ? thisMonth : monthlyOn(date, rule.monthDay, 1);
    }
  }
}

/**
 * Due date of the instance that follows one due on `due`. It is computed from `due`
 * (not from the completion date); when that is still in the past, the first date of the
 * rule from `today` on is used, so one completion never creates several instances.
 */
export function nextDueDate(rule: SeriesRule, due: string | null, today: string): string {
  if (due === null) return firstOnOrAfter(rule, today);
  let next: string;
  switch (rule.kind) {
    case 'daily':
      next = addDays(due, 1);
      break;
    case 'weekly':
      next = firstOnOrAfter(rule, addDays(due, 1));
      break;
    case 'monthly':
      next = monthlyOn(due, rule.monthDay, 1);
      break;
  }
  return next < today ? firstOnOrAfter(rule, today) : next;
}
