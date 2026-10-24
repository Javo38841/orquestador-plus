import { isOverdue, localDate, type Task } from './tasks';

/** Tasks shown in Hoy (RF-03). */
export interface TodayGroups {
  overdue: Task[];
  today: Task[];
}

/**
 * Completed on the local `today` and not taken off Hoy since ("Quitar de la lista" hides only the
 * completion it follows).
 */
export function isDoneToday(task: Task, today: string): boolean {
  if (task.status !== 'done' || task.completedAt === null) return false;
  if (task.hiddenFromTodayAt !== null && task.hiddenFromTodayAt >= task.completedAt) return false;
  return localDate(new Date(task.completedAt)) === today;
}

/**
 * Unfinished tasks, plus the ones completed today (shown struck through until taken off the list):
 * overdue first, then due today or marked "para hoy".
 */
export function todayGroups(tasks: Task[], now: Date = new Date()): TodayGroups {
  const today = localDate(now);
  // The given order is kept: a task completed in place stays where it was.
  const shown = tasks.filter((t) => t.status !== 'done' || isDoneToday(t, today));
  const late = (t: Task) => isOverdue({ ...t, status: 'todo' }, today);
  return {
    overdue: shown.filter(late),
    today: shown.filter((t) => !late(t) && (t.dueDate === today || t.forToday)),
  };
}

/** Tasks of a group still to be done (completed ones are shown but not counted). */
export function pendingOf(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status !== 'done');
}

/** Unfinished tasks due tomorrow (local day). */
export function tomorrowTasks(tasks: Task[], now: Date = new Date()): Task[] {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrow = localDate(next);
  return tasks.filter((t) => t.status !== 'done' && t.dueDate === tomorrow);
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
