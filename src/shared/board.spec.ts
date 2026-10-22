import { describe, expect, it } from 'vitest';
import { buildBoard, DONE_WINDOW_DAYS, isBoardSelection, parseBoardSelection } from './board';
import type { Task } from './tasks';

const NOW = new Date('2026-03-20T12:00:00.000Z');
const DAY = 24 * 3600 * 1000;

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

const doneAgo = (id: number, ms: number, extra: Partial<Task> = {}) =>
  task(id, { status: 'done', completedAt: new Date(NOW.getTime() - ms).toISOString(), ...extra });

const ids = (tasks: Task[]) => tasks.map((t) => t.id);

describe('buildBoard', () => {
  const all = [
    task(1),
    task(2, { status: 'in_progress', projectId: 7, projectName: 'api' }),
    task(3, { projectId: 7, projectName: 'api', tags: ['infra'] }),
    task(4, { projectId: 8, projectName: 'web', tags: ['infra', 'ui'] }),
    doneAgo(5, DAY, { projectId: 7, projectName: 'api' }),
  ];

  it('CP-04-01: puts every task in the column of its status', () => {
    const board = buildBoard(all, { board: 'general', tag: null }, NOW);
    expect(ids(board.todo)).toEqual([1, 3, 4]);
    expect(ids(board.in_progress)).toEqual([2]);
    expect(ids(board.done)).toEqual([5]);
  });

  it('CP-05-01: "Activas" shows every task, loose ones included; a project chip only that project', () => {
    expect(
      Object.values(buildBoard(all, { board: 'general', tag: null }, NOW)).flat(),
    ).toHaveLength(5);
    const api = buildBoard(all, { board: { projectId: 7 }, tag: null }, NOW);
    expect(ids(Object.values(api).flat())).toEqual([3, 2, 5]);
  });

  it('CP-05-02: tag filter narrows the board and combines with the project filter', () => {
    const infra = buildBoard(all, { board: 'general', tag: 'infra' }, NOW);
    expect(ids(infra.todo)).toEqual([3, 4]);
    expect(infra.in_progress).toEqual([]);
    const both = buildBoard(all, { board: { projectId: 8 }, tag: 'infra' }, NOW);
    expect(ids(both.todo)).toEqual([4]);
    expect(buildBoard(all, { board: { projectId: 8 }, tag: 'nope' }, NOW).todo).toEqual([]);
  });

  it('CP-05-03: "Hecho" keeps tasks completed within 7 days and drops older ones (boundary)', () => {
    const tasks = [
      doneAgo(1, DONE_WINDOW_DAYS * DAY),
      doneAgo(2, DONE_WINDOW_DAYS * DAY + 1),
      doneAgo(3, 0),
      task(4, { status: 'done', completedAt: null }),
    ];
    const board = buildBoard(tasks, { board: 'general', tag: null }, NOW);
    expect(ids(board.done)).toEqual([1, 3]);
  });

  describe('"Sueltas"', () => {
    const loose = [
      ...all,
      task(6, { tags: ['infra'] }),
      task(7, { status: 'in_progress', tags: ['ui'] }),
      doneAgo(8, DAY),
      doneAgo(9, DONE_WINDOW_DAYS * DAY + 1),
    ];

    it('CP-05-06: shows only tasks without a project, in the same columns, with the 7-day "Hecho" window', () => {
      const board = buildBoard(loose, { board: 'loose', tag: null }, NOW);
      expect(ids(board.todo)).toEqual([1, 6]);
      expect(ids(board.in_progress)).toEqual([7]);
      expect(ids(board.done)).toEqual([8]);
    });

    it('CP-05-07: tag filter combines with "Sueltas"', () => {
      const board = buildBoard(loose, { board: 'loose', tag: 'infra' }, NOW);
      expect(ids(board.todo)).toEqual([6]);
      expect(board.in_progress).toEqual([]);
      expect(board.done).toEqual([]);
    });

    it('CP-05-08: with no loose tasks, or no tag match, the three columns are empty', () => {
      const withProject = all.filter((t) => t.projectId !== null);
      expect(buildBoard(withProject, { board: 'loose', tag: null }, NOW)).toEqual({
        todo: [],
        in_progress: [],
        done: [],
      });
      expect(buildBoard(loose, { board: 'loose', tag: 'nope' }, NOW)).toEqual({
        todo: [],
        in_progress: [],
        done: [],
      });
    });

    it('CP-05-09: a task given a project leaves "Sueltas" and one losing its project joins it', () => {
      const moved = loose.map((t) =>
        t.id === 1
          ? { ...t, projectId: 7, projectName: 'api' }
          : t.id === 3
            ? { ...t, projectId: null, projectName: null }
            : t,
      );
      const board = buildBoard(moved, { board: 'loose', tag: null }, NOW);
      expect(ids(board.todo)).toEqual([3, 6]);
    });
  });

  describe('parseBoardSelection / isBoardSelection', () => {
    it('CP-04-14: reads legacy integers as projects, "loose" as loose and anything else as General', () => {
      expect(parseBoardSelection('5')).toEqual({ projectId: 5 });
      expect(parseBoardSelection('loose')).toBe('loose');
      expect(parseBoardSelection(undefined)).toBe('general');
      expect(parseBoardSelection('x')).toBe('general');
    });

    it('CP-04-15: accepts only "general", "loose" or an integer project id', () => {
      expect(isBoardSelection('general')).toBe(true);
      expect(isBoardSelection('loose')).toBe(true);
      expect(isBoardSelection({ projectId: 3 })).toBe(true);
      for (const bad of [null, 3, '3', {}, { projectId: 1.5 }, { projectId: null }, 'other'])
        expect(isBoardSelection(bad)).toBe(false);
    });
  });
});
