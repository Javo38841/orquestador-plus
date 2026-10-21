import type { Task, TaskStatus } from './tasks';

/** Kanban board (RF-04, RF-05): columns, filters and the "Hecho" window. */

export const BOARD_COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'done'];

/** "Hecho" only shows tasks completed within this many days. */
export const DONE_WINDOW_DAYS = 7;

const DAY_MS = 24 * 3600 * 1000;

export interface BoardFilter {
  /** Null is "Activas" (every task, loose ones included); otherwise a single project. */
  projectId: number | null;
  /** Null shows every tag. Combines with the project filter. */
  tag: string | null;
}

export type Board = Record<TaskStatus, Task[]>;

/** True when the task was completed no longer than `DONE_WINDOW_DAYS` ago. */
export function isRecentlyDone(task: Pick<Task, 'completedAt'>, now: Date): boolean {
  if (task.completedAt === null) return false;
  return now.getTime() - new Date(task.completedAt).getTime() <= DONE_WINDOW_DAYS * DAY_MS;
}

export function buildBoard(tasks: Task[], filter: BoardFilter, now: Date = new Date()): Board {
  const board: Board = { todo: [], in_progress: [], done: [] };
  for (const task of tasks) {
    if (filter.projectId !== null && task.projectId !== filter.projectId) continue;
    if (filter.tag !== null && !task.tags.includes(filter.tag)) continue;
    if (task.status === 'done' && !isRecentlyDone(task, now)) continue;
    board[task.status].push(task);
  }
  return board;
}
