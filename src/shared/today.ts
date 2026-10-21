import { isOverdue, localDate, type Task } from './tasks';

/** Tasks shown in Hoy (RF-03). */
export interface TodayGroups {
  overdue: Task[];
  today: Task[];
}

/** Pending tasks only: overdue first, then due today or marked "para hoy". */
export function todayGroups(tasks: Task[], now: Date = new Date()): TodayGroups {
  const today = localDate(now);
  const pending = tasks.filter((t) => t.status === 'todo');
  return {
    overdue: pending.filter((t) => isOverdue(t, today)),
    today: pending.filter((t) => !isOverdue(t, today) && (t.dueDate === today || t.forToday)),
  };
}

export type DueLabel =
  { kind: 'today' } | { kind: 'yesterday' } | { kind: 'daysAgo'; days: number };

const DAY_MS = 24 * 3600 * 1000;

function utcDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Relative label for a due date: null when undated or in the future. */
export function dueLabel(dueDate: string | null, now: Date = new Date()): DueLabel | null {
  if (dueDate === null) return null;
  const days = Math.round((utcDay(localDate(now)) - utcDay(dueDate)) / DAY_MS);
  if (days < 0) return null;
  if (days === 0) return { kind: 'today' };
  if (days === 1) return { kind: 'yesterday' };
  return { kind: 'daysAgo', days };
}

/** Spanish long date without comma, e.g. "martes 20 de octubre". */
export function formatLongDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('es', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} de ${get('month')}`;
}
