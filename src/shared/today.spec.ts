import { describe, expect, it } from 'vitest';
import { dueLabel, formatLongDate, todayGroups, tomorrowTasks } from './today';
import { localDate, type Task } from './tasks';

// Tuesday 2026-10-20, midday local time.
const NOW = new Date(2026, 9, 20, 12, 0);

const task = (id: number, extra: Partial<Task> = {}): Task => ({
  id,
  title: `t${id}`,
  status: 'todo',
  dueDate: null,
  projectId: null,
  projectName: null,
  forToday: false,
  tags: [],
  createdAt: '2026-03-01T10:00:00.000Z',
  completedAt: null,
  seriesId: null,
  recurrence: { kind: 'once' },
  reminderAt: null,
  reminderNotifiedAt: null,
  ...extra,
});

describe('todayGroups', () => {
  it('CP-03-01: a pending task due yesterday is overdue and labelled "yesterday"', () => {
    const t = task(1, { dueDate: '2026-10-19' });
    expect(todayGroups([t], NOW).overdue).toEqual([t]);
    expect(dueLabel(t.dueDate, NOW)).toEqual({ kind: 'yesterday' });
    expect(dueLabel('2026-10-17', NOW)).toEqual({ kind: 'daysAgo', days: 3 });
  });

  it('CP-03-02: a pending task due today goes to "Para hoy"', () => {
    const t = task(1, { dueDate: '2026-10-20' });
    expect(todayGroups([t], NOW)).toEqual({ overdue: [], today: [t] });
  });

  it('CP-03-03: an undated task marked for today goes to "Para hoy"', () => {
    const t = task(1, { forToday: true });
    expect(todayGroups([t], NOW).today).toEqual([t]);
  });

  it('CP-03-04: completed tasks and tasks due tomorrow are left out', () => {
    const list = [
      task(1, { status: 'done', dueDate: '2026-10-20' }),
      task(2, { status: 'done', dueDate: '2026-10-10', forToday: true }),
      task(3, { dueDate: '2026-10-21' }),
      task(4),
    ];
    expect(todayGroups(list, NOW)).toEqual({ overdue: [], today: [] });
  });

  it('CP-04-03: a task in progress still shows in Hoy until it is done', () => {
    const t = task(1, { status: 'in_progress', dueDate: '2026-10-19' });
    expect(todayGroups([t], NOW).overdue).toEqual([t]);
  });

  it('CP-03-05: the day boundary is local midnight, not UTC', () => {
    const t = task(1, { dueDate: '2026-10-20' });
    const lateNight = new Date(2026, 9, 20, 23, 59, 59);
    const justAfter = new Date(2026, 9, 21, 0, 0, 1);
    expect(localDate(lateNight)).toBe('2026-10-20');
    expect(localDate(justAfter)).toBe('2026-10-21');
    expect(todayGroups([t], lateNight).today).toEqual([t]);
    expect(todayGroups([t], justAfter).overdue).toEqual([t]);
  });

  it('a task marked for today but overdue is only listed once, as overdue', () => {
    const t = task(1, { dueDate: '2026-10-01', forToday: true });
    expect(todayGroups([t], NOW)).toEqual({ overdue: [t], today: [] });
  });
});

describe('formatLongDate', () => {
  it('CP-03-06: formats the date in Spanish', () => {
    expect(formatLongDate(NOW)).toBe('martes 20 de octubre');
  });
});

describe('dueLabel', () => {
  it('labels today and ignores undated or future dates', () => {
    expect(dueLabel('2026-10-20', NOW)).toEqual({ kind: 'today' });
    expect(dueLabel(null, NOW)).toBeNull();
    expect(dueLabel('2026-10-21', NOW)).toBeNull();
  });
});

describe('tomorrowTasks', () => {
  it('CP-03-17: lists unfinished tasks due tomorrow', () => {
    const t = task(1, { dueDate: '2026-10-21' });
    expect(tomorrowTasks([t], NOW)).toEqual([t]);
  });

  it('CP-03-18: skips completed tasks and the days around tomorrow, at the local day edge', () => {
    const late = new Date(2026, 9, 20, 23, 59);
    const early = new Date(2026, 9, 20, 0, 1);
    const tasks = [
      task(1, { dueDate: '2026-10-21', status: 'done' }),
      task(2, { dueDate: '2026-10-20' }),
      task(3, { dueDate: '2026-10-22' }),
      task(4, { dueDate: '2026-10-21' }),
    ];
    expect(tomorrowTasks(tasks, late).map((t) => t.id)).toEqual([4]);
    expect(tomorrowTasks(tasks, early).map((t) => t.id)).toEqual([4]);
  });
});
