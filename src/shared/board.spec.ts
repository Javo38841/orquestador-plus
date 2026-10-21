import { describe, expect, it } from 'vitest';
import { buildBoard, DONE_WINDOW_DAYS } from './board';
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
    const board = buildBoard(all, { projectId: null, tag: null }, NOW);
    expect(ids(board.todo)).toEqual([1, 3, 4]);
    expect(ids(board.in_progress)).toEqual([2]);
    expect(ids(board.done)).toEqual([5]);
  });

  it('CP-05-01: "Activas" shows every task, loose ones included; a project chip only that project', () => {
    expect(Object.values(buildBoard(all, { projectId: null, tag: null }, NOW)).flat()).toHaveLength(
      5,
    );
    const api = buildBoard(all, { projectId: 7, tag: null }, NOW);
    expect(ids(Object.values(api).flat())).toEqual([3, 2, 5]);
  });

  it('CP-05-02: tag filter narrows the board and combines with the project filter', () => {
    const infra = buildBoard(all, { projectId: null, tag: 'infra' }, NOW);
    expect(ids(infra.todo)).toEqual([3, 4]);
    expect(infra.in_progress).toEqual([]);
    const both = buildBoard(all, { projectId: 8, tag: 'infra' }, NOW);
    expect(ids(both.todo)).toEqual([4]);
    expect(buildBoard(all, { projectId: 8, tag: 'nope' }, NOW).todo).toEqual([]);
  });

  it('CP-05-03: "Hecho" keeps tasks completed within 7 days and drops older ones (boundary)', () => {
    const tasks = [
      doneAgo(1, DONE_WINDOW_DAYS * DAY),
      doneAgo(2, DONE_WINDOW_DAYS * DAY + 1),
      doneAgo(3, 0),
      task(4, { status: 'done', completedAt: null }),
    ];
    const board = buildBoard(tasks, { projectId: null, tag: null }, NOW);
    expect(ids(board.done)).toEqual([1, 3]);
  });
});
